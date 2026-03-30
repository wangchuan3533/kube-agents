import type { NatsConnection, JetStreamClient, JetStreamManager } from 'nats';
import { RetentionPolicy, StorageType } from 'nats';
import type { Trace, Run, LLMMessage } from '@kube-agents/core';
import { TRACE_STREAM_NAME, TRACE_STREAM_SUBJECTS, NATS_SUBJECTS } from '@kube-agents/core';
import { randomUUID } from 'node:crypto';

const encoder = new TextEncoder();

function encode(data: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(data));
}

// ---------------------------------------------------------------------------
// RunHandle — wraps an individual Run (LLM call, tool call, chain step)
// ---------------------------------------------------------------------------

export class RunHandle {
  readonly id: string;
  readonly traceId: string;
  readonly parentRunId: string | undefined;
  private readonly tracer: Tracer;
  private readonly projectName: string;
  private readonly name: string;
  private readonly runType: Run['runType'];
  private readonly startedAt: Date;
  private status: Run['status'] = 'running';

  // LLM fields
  private promptTokens?: number;
  private completionTokens?: number;
  private totalTokens?: number;
  private model?: string;
  private provider?: string;
  private temperature?: number;
  private promptMessages?: LLMMessage[];
  private completion?: string;
  private finishReason?: string;
  private toolCalls: Array<{ id: string; name: string; arguments: string }> = [];

  // Generic fields
  private inputs?: Record<string, unknown>;
  private outputs?: Record<string, unknown>;
  private error?: string;
  private metadata: Record<string, string>;
  private tags: string[];

  constructor(
    tracer: Tracer,
    projectName: string,
    traceId: string,
    parentRunId: string | undefined,
    name: string,
    runType: Run['runType'],
    options?: { inputs?: Record<string, unknown>; metadata?: Record<string, string>; tags?: string[] },
  ) {
    this.id = randomUUID();
    this.tracer = tracer;
    this.projectName = projectName;
    this.traceId = traceId;
    this.parentRunId = parentRunId;
    this.name = name;
    this.runType = runType;
    this.startedAt = new Date();
    this.inputs = options?.inputs;
    this.metadata = options?.metadata ?? {};
    this.tags = options?.tags ?? [];
  }

  setLLMResult(data: {
    model: string;
    provider: string;
    temperature?: number;
    promptMessages: LLMMessage[];
    completion: string;
    finishReason: string;
    toolCalls: Array<{ id: string; name: string; arguments: string }>;
    usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  }): void {
    this.model = data.model;
    this.provider = data.provider;
    this.temperature = data.temperature;
    this.promptMessages = data.promptMessages;
    this.completion = data.completion;
    this.finishReason = data.finishReason;
    this.toolCalls = data.toolCalls;
    this.promptTokens = data.usage.promptTokens;
    this.completionTokens = data.usage.completionTokens;
    this.totalTokens = data.usage.totalTokens;
  }

  setToolResult(result: string, isError: boolean): void {
    this.outputs = { result };
    if (isError) {
      this.error = result;
    }
  }

  startChildRun(
    name: string,
    runType: Run['runType'],
    options?: { inputs?: Record<string, unknown>; metadata?: Record<string, string>; tags?: string[] },
  ): RunHandle {
    return new RunHandle(this.tracer, this.projectName, this.traceId, this.id, name, runType, options);
  }

  async complete(outputs?: Record<string, unknown>): Promise<void> {
    if (outputs) this.outputs = outputs;
    this.status = 'completed';
    await this.publish();
  }

  async fail(error: string): Promise<void> {
    this.error = error;
    this.status = 'error';
    await this.publish();
  }

  private toRun(): Run {
    const now = new Date();
    return {
      id: this.id,
      traceId: this.traceId,
      parentRunId: this.parentRunId,
      name: this.name,
      runType: this.runType,
      status: this.status,
      inputs: this.inputs,
      outputs: this.outputs,
      error: this.error,
      metadata: this.metadata,
      tags: this.tags,
      startedAt: this.startedAt,
      completedAt: this.status !== 'running' ? now : undefined,
      latencyMs: this.status !== 'running' ? now.getTime() - this.startedAt.getTime() : undefined,
      promptTokens: this.promptTokens,
      completionTokens: this.completionTokens,
      totalTokens: this.totalTokens,
      model: this.model,
      provider: this.provider,
      temperature: this.temperature,
      promptMessages: this.promptMessages,
      completion: this.completion,
      finishReason: this.finishReason,
      toolCalls: this.toolCalls,
    };
  }

  private async publish(): Promise<void> {
    await this.tracer.publishRun(this.projectName, this.toRun());
  }
}

// ---------------------------------------------------------------------------
// TraceHandle — wraps a Trace (one end-to-end operation)
// ---------------------------------------------------------------------------

export class TraceHandle {
  readonly id: string;
  readonly projectId: string;
  readonly projectName: string;
  private readonly tracer: Tracer;
  private readonly name: string;
  private readonly sessionId: string | undefined;
  private readonly startedAt: Date;
  private status: Trace['status'] = 'running';
  private totalTokens = 0;
  private promptTokens = 0;
  private completionTokens = 0;
  private inputs?: Record<string, unknown>;
  private outputs?: Record<string, unknown>;
  private error?: string;
  private metadata: Record<string, string>;
  private tags: string[];

  constructor(
    tracer: Tracer,
    projectId: string,
    projectName: string,
    name: string,
    options?: {
      sessionId?: string;
      inputs?: Record<string, unknown>;
      metadata?: Record<string, string>;
      tags?: string[];
    },
  ) {
    this.id = randomUUID();
    this.tracer = tracer;
    this.projectId = projectId;
    this.projectName = projectName;
    this.name = name;
    this.sessionId = options?.sessionId;
    this.inputs = options?.inputs;
    this.metadata = options?.metadata ?? {};
    this.tags = options?.tags ?? [];
    this.startedAt = new Date();
  }

  startRun(
    name: string,
    runType: Run['runType'],
    options?: { inputs?: Record<string, unknown>; metadata?: Record<string, string>; tags?: string[] },
  ): RunHandle {
    return new RunHandle(this.tracer, this.projectName, this.id, undefined, name, runType, options);
  }

  addTokens(usage: { promptTokens: number; completionTokens: number; totalTokens: number }): void {
    this.promptTokens += usage.promptTokens;
    this.completionTokens += usage.completionTokens;
    this.totalTokens += usage.totalTokens;
  }

  async complete(outputs?: Record<string, unknown>): Promise<void> {
    if (outputs) this.outputs = outputs;
    this.status = 'completed';
    await this.publish();
  }

  async fail(error: string): Promise<void> {
    this.error = error;
    this.status = 'error';
    await this.publish();
  }

  private toTrace(): Trace {
    const now = new Date();
    return {
      id: this.id,
      projectId: this.projectId,
      name: this.name,
      sessionId: this.sessionId,
      status: this.status,
      inputs: this.inputs,
      outputs: this.outputs,
      error: this.error,
      metadata: this.metadata,
      tags: this.tags,
      startedAt: this.startedAt,
      completedAt: this.status !== 'running' ? now : undefined,
      totalLatencyMs: this.status !== 'running' ? now.getTime() - this.startedAt.getTime() : undefined,
      totalTokens: this.totalTokens,
      promptTokens: this.promptTokens,
      completionTokens: this.completionTokens,
    };
  }

  async publishStarted(): Promise<void> {
    await this.publish();
  }

  private async publish(): Promise<void> {
    await this.tracer.publishTrace(this.projectName, this.toTrace());
  }
}

// ---------------------------------------------------------------------------
// Tracer — manages JetStream publishing
// ---------------------------------------------------------------------------

export class Tracer {
  private readonly nc: NatsConnection;
  private js: JetStreamClient | undefined;
  private initialized = false;

  // Project ID cache (agentName → projectId)
  private projectIds = new Map<string, string>();

  constructor(nc: NatsConnection) {
    this.nc = nc;
  }

  async init(): Promise<void> {
    try {
      const jsm: JetStreamManager = await this.nc.jetstreamManager();
      this.js = this.nc.jetstream();

      // Ensure the trace stream exists
      try {
        await jsm.streams.info(TRACE_STREAM_NAME);
      } catch {
        await jsm.streams.add({
          name: TRACE_STREAM_NAME,
          subjects: TRACE_STREAM_SUBJECTS,
          retention: RetentionPolicy.Limits,
          storage: StorageType.File,
          max_age: 3 * 24 * 60 * 60 * 1_000_000_000, // 3 days in nanoseconds
          max_bytes: 512 * 1024 * 1024, // 512 MB
        });
      }
      this.initialized = true;
    } catch (err) {
      console.error('[Tracer] Failed to initialize:', err);
    }
  }

  getProjectId(agentName: string): string {
    let id = this.projectIds.get(agentName);
    if (!id) {
      id = randomUUID();
      this.projectIds.set(agentName, id);
    }
    return id;
  }

  startTrace(
    agentName: string,
    name: string,
    options?: {
      sessionId?: string;
      inputs?: Record<string, unknown>;
      metadata?: Record<string, string>;
      tags?: string[];
    },
  ): TraceHandle {
    const projectId = this.getProjectId(agentName);
    const handle = new TraceHandle(this, projectId, agentName, name, options);
    // Fire-and-forget the initial trace event
    handle.publishStarted().catch((err) => {
      console.error('[Tracer] Failed to publish trace start:', err);
    });
    return handle;
  }

  async publishTrace(projectName: string, trace: Trace): Promise<void> {
    if (!this.initialized || !this.js) return;
    try {
      const subject = NATS_SUBJECTS.trace(projectName);
      await this.js.publish(subject, encode(trace));
    } catch (err) {
      console.error('[Tracer] Failed to publish trace:', err);
    }
  }

  async publishRun(projectName: string, run: Run): Promise<void> {
    if (!this.initialized || !this.js) return;
    try {
      const subject = NATS_SUBJECTS.run(projectName);
      await this.js.publish(subject, encode(run));
    } catch (err) {
      console.error('[Tracer] Failed to publish run:', err);
    }
  }
}
