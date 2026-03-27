import type { NatsConnection, JetStreamClient, JetStreamManager } from 'nats';
import { RetentionPolicy, StorageType } from 'nats';
import type { TraceRun, TraceSpan, TraceLLMSpan, TraceToolSpan } from '@kube-agents/core';
import { TRACE_STREAM_NAME, TRACE_STREAM_SUBJECTS, NATS_SUBJECTS } from '@kube-agents/core';
import { randomUUID } from 'node:crypto';

const encoder = new TextEncoder();

function encode(data: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(data));
}

export class RunContext {
  readonly id: string;
  private readonly tracer: Tracer;
  private readonly agentName: string;
  private readonly agentEmail: string;
  private readonly emailId: string;
  private readonly threadId: string | undefined;
  private readonly startedAt: Date;
  private totalTokens = 0;
  private promptTokens = 0;
  private completionTokens = 0;
  private iterationCount = 0;

  constructor(
    tracer: Tracer,
    agentName: string,
    agentEmail: string,
    emailId: string,
    threadId: string | undefined,
  ) {
    this.id = randomUUID();
    this.tracer = tracer;
    this.agentName = agentName;
    this.agentEmail = agentEmail;
    this.emailId = emailId;
    this.threadId = threadId;
    this.startedAt = new Date();
  }

  toRun(status: TraceRun['status'], error?: string): TraceRun {
    const now = new Date();
    return {
      id: this.id,
      agentName: this.agentName,
      agentEmail: this.agentEmail,
      emailId: this.emailId,
      threadId: this.threadId,
      startedAt: this.startedAt,
      completedAt: status !== 'running' ? now : undefined,
      status,
      error,
      totalLatencyMs: status !== 'running' ? now.getTime() - this.startedAt.getTime() : undefined,
      iterationCount: this.iterationCount,
      totalTokens: this.totalTokens,
      promptTokens: this.promptTokens,
      completionTokens: this.completionTokens,
    };
  }

  async publishStarted(): Promise<void> {
    await this.tracer.publishRun(this.toRun('running'));
  }

  async recordLLMCall(
    llmData: TraceLLMSpan,
    startedAt: Date,
    completedAt: Date,
  ): Promise<void> {
    this.iterationCount = llmData.iteration;
    this.totalTokens += llmData.usage.totalTokens;
    this.promptTokens += llmData.usage.promptTokens;
    this.completionTokens += llmData.usage.completionTokens;

    const span: TraceSpan = {
      id: randomUUID(),
      runId: this.id,
      agentName: this.agentName,
      type: 'llm_call',
      startedAt,
      completedAt,
      latencyMs: completedAt.getTime() - startedAt.getTime(),
      llm: llmData,
    };
    await this.tracer.publishSpan(span);
  }

  async recordToolCall(
    toolData: TraceToolSpan,
    startedAt: Date,
    completedAt: Date,
  ): Promise<void> {
    const span: TraceSpan = {
      id: randomUUID(),
      runId: this.id,
      agentName: this.agentName,
      type: 'tool_call',
      startedAt,
      completedAt,
      latencyMs: completedAt.getTime() - startedAt.getTime(),
      tool: toolData,
    };
    await this.tracer.publishSpan(span);
  }

  async complete(): Promise<void> {
    await this.tracer.publishRun(this.toRun('completed'));
  }

  async fail(error: string): Promise<void> {
    await this.tracer.publishRun(this.toRun('error', error));
  }
}

export class Tracer {
  private readonly nc: NatsConnection;
  private js: JetStreamClient | undefined;
  private initialized = false;

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

  startRun(
    agentName: string,
    agentEmail: string,
    emailId: string,
    threadId: string | undefined,
  ): RunContext {
    const ctx = new RunContext(this, agentName, agentEmail, emailId, threadId);
    // Fire-and-forget the initial run event
    ctx.publishStarted().catch((err) => {
      console.error('[Tracer] Failed to publish run start:', err);
    });
    return ctx;
  }

  async publishRun(run: TraceRun): Promise<void> {
    if (!this.initialized || !this.js) return;
    try {
      const subject = NATS_SUBJECTS.traceRun(run.agentName);
      await this.js.publish(subject, encode(run));
    } catch (err) {
      console.error('[Tracer] Failed to publish run:', err);
    }
  }

  async publishSpan(span: TraceSpan): Promise<void> {
    if (!this.initialized || !this.js) return;
    try {
      const subject = NATS_SUBJECTS.traceSpan(span.agentName);
      await this.js.publish(subject, encode(span));
    } catch (err) {
      console.error('[Tracer] Failed to publish span:', err);
    }
  }
}
