import {
  type NatsConnection,
  type JetStreamClient,
  type JetStreamManager,
} from 'nats';
import { type Email, STREAM_NAME, TRACE_STREAM_NAME, type TraceRun, type TraceSpan, type Trace, type Run } from '@kube-agents/core';
import { createNatsConnection, decodeEmail, subjectsForAgent } from '@kube-agents/mail';
import {
  upsertProject,
  upsertTrace,
  insertRun,
  getProjectByName,
} from './db.js';
import { randomUUID } from 'node:crypto';

let nc: NatsConnection | undefined;
let js: JetStreamClient | undefined;
let jsm: JetStreamManager | undefined;
let natsAvailable = false;

export async function initNats(): Promise<void> {
  const url = process.env['NATS_URL'] ?? 'nats://localhost:4222';
  try {
    nc = await createNatsConnection({ servers: url, name: 'kube-agents-dashboard' });
    js = nc.jetstream();
    jsm = await nc.jetstreamManager();
    natsAvailable = true;
    console.log(`[nats-client] Connected to NATS at ${url}`);
  } catch (err) {
    console.warn(`[nats-client] Failed to connect to NATS at ${url}:`, err);
    natsAvailable = false;
  }
}

const decoder = new TextDecoder();

export function isNatsAvailable(): boolean {
  return natsAvailable;
}

// ---------------------------------------------------------------------------
// Legacy format ingestion — maps old TraceRun/TraceSpan to new Project/Trace/Run
// ---------------------------------------------------------------------------

async function ensureProject(agentName: string): Promise<string> {
  const existing = await getProjectByName(agentName);
  if (existing) return existing.id;

  const id = randomUUID();
  const now = new Date();
  await upsertProject({
    id,
    name: agentName,
    description: `Auto-created project for agent ${agentName}`,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

async function ingestLegacyTraceRun(raw: TraceRun): Promise<void> {
  const projectId = await ensureProject(raw.agentName);

  await upsertTrace({
    id: raw.id,
    projectId,
    name: `email:${raw.emailId.slice(0, 8)}`,
    sessionId: raw.threadId,
    status: raw.status,
    inputs: { emailId: raw.emailId, from: raw.agentEmail },
    outputs: undefined,
    error: raw.error,
    metadata: { agentName: raw.agentName, agentEmail: raw.agentEmail },
    tags: [],
    startedAt: raw.startedAt,
    completedAt: raw.completedAt,
    totalLatencyMs: raw.totalLatencyMs,
    totalTokens: raw.totalTokens,
    promptTokens: raw.promptTokens,
    completionTokens: raw.completionTokens,
    cost: undefined,
  });
}

async function ingestLegacyTraceSpan(raw: TraceSpan): Promise<void> {
  if (raw.type === 'llm_call' && raw.llm) {
    await insertRun({
      id: raw.id,
      traceId: raw.runId,
      parentRunId: undefined,
      name: `llm:${raw.llm.model}`,
      runType: 'llm',
      status: 'completed',
      inputs: undefined,
      outputs: undefined,
      error: undefined,
      metadata: { iteration: String(raw.llm.iteration) },
      tags: [],
      startedAt: raw.startedAt,
      completedAt: raw.completedAt,
      latencyMs: raw.latencyMs,
      promptTokens: raw.llm.usage.promptTokens,
      completionTokens: raw.llm.usage.completionTokens,
      totalTokens: raw.llm.usage.totalTokens,
      model: raw.llm.model,
      provider: raw.llm.provider,
      temperature: raw.llm.temperature,
      promptMessages: raw.llm.messages,
      completion: raw.llm.completion,
      finishReason: raw.llm.finishReason,
      toolCalls: raw.llm.toolCalls,
    });
  } else if (raw.type === 'tool_call' && raw.tool) {
    await insertRun({
      id: raw.id,
      traceId: raw.runId,
      parentRunId: undefined,
      name: `tool:${raw.tool.name}`,
      runType: 'tool',
      status: raw.tool.isError ? 'error' : 'completed',
      inputs: { arguments: raw.tool.arguments },
      outputs: { result: raw.tool.result },
      error: raw.tool.isError ? raw.tool.result : undefined,
      metadata: { toolCallId: raw.tool.toolCallId },
      tags: [],
      startedAt: raw.startedAt,
      completedAt: raw.completedAt,
      latencyMs: raw.latencyMs,
      promptTokens: undefined,
      completionTokens: undefined,
      totalTokens: undefined,
      model: undefined,
      provider: undefined,
      temperature: undefined,
      promptMessages: undefined,
      completion: undefined,
      finishReason: undefined,
      toolCalls: [],
    });
  }
}

// ---------------------------------------------------------------------------
// Trace consumer — ingests events from NATS JetStream into SQLite
// ---------------------------------------------------------------------------

export async function initTraceConsumer(): Promise<void> {
  if (!js) return;
  try {
    await jsm!.streams.info(TRACE_STREAM_NAME);
  } catch {
    console.log('[nats-client] Trace stream not yet available. Trace consumer will not start.');
    return;
  }

  try {
    const consumer = await js.consumers.get(TRACE_STREAM_NAME, {
      filterSubjects: ['trace.>'],
    });

    const iter = await consumer.consume();

    (async () => {
      for await (const msg of iter) {
        try {
          const raw = JSON.parse(decoder.decode(msg.data));
          const subject = msg.subject;

          if (subject.startsWith('trace.trace.')) {
            // New Trace format (from updated runtime)
            const trace = raw as Trace;
            await ensureProject(subject.slice('trace.trace.'.length));
            await upsertTrace(trace);
          } else if (subject.startsWith('trace.run.')) {
            // Disambiguate: new Run has `runType`, legacy TraceRun has `emailId`
            if ('runType' in raw) {
              // New Run format (from updated runtime)
              await insertRun(raw as Run);
            } else {
              // Legacy TraceRun format (from old runtime)
              await ingestLegacyTraceRun(raw as TraceRun);
            }
          } else if (subject.startsWith('trace.span.')) {
            // Legacy TraceSpan format (from old runtime)
            await ingestLegacyTraceSpan(raw as TraceSpan);
          }
        } catch (err) {
          console.error('[nats-client] Failed to process trace event:', err);
        }
      }
    })().catch(() => {
      // consumer ended
    });

    console.log('[nats-client] Trace consumer started (PostgreSQL backend)');
  } catch (err) {
    console.warn('[nats-client] Failed to start trace consumer:', err);
  }
}

// ---------------------------------------------------------------------------
// Email message queries (unchanged)
// ---------------------------------------------------------------------------

export interface MessageListResult {
  messages: Email[];
  hasMore: boolean;
}

export async function getAgentMessages(
  agentEmail: string,
  groups: string[] = [],
  options: { limit?: number } = {},
): Promise<MessageListResult> {
  if (!js) throw new Error('NATS not available');

  const limit = options.limit ?? 50;
  const subjects = subjectsForAgent(agentEmail, groups);

  const consumer = await js.consumers.get(STREAM_NAME, {
    filterSubjects: subjects,
  });

  const messages: Email[] = [];
  const iter = await consumer.fetch({ max_messages: limit + 1, expires: 3000 });

  for await (const msg of iter) {
    try {
      const email = decodeEmail(msg.data);
      messages.push(email);
      if (messages.length > limit) break;
    } catch {
      // skip malformed messages
    }
  }

  const hasMore = messages.length > limit;
  if (hasMore) messages.pop();

  messages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return { messages, hasMore };
}

export async function getThreadMessages(threadId: string): Promise<Email[]> {
  if (!js) throw new Error('NATS not available');

  const consumer = await js.consumers.get(STREAM_NAME, {
    filterSubjects: ['mail.>'],
  });

  const messages: Email[] = [];
  const iter = await consumer.fetch({ max_messages: 200, expires: 5000 });

  for await (const msg of iter) {
    try {
      const email = decodeEmail(msg.data);
      if (email.threadId === threadId || email.id === threadId) {
        messages.push(email);
      }
    } catch {
      // skip malformed
    }
  }

  messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return messages;
}

export async function closeNats(): Promise<void> {
  await nc?.close();
  nc = undefined;
  js = undefined;
  jsm = undefined;
  natsAvailable = false;
}
