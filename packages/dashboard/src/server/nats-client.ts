import {
  type NatsConnection,
  type JetStreamClient,
  type JetStreamManager,
} from 'nats';
import { type Email, STREAM_NAME, TRACE_STREAM_NAME, type TraceRun, type TraceSpan } from '@kube-agents/core';
import { createNatsConnection, decodeEmail, subjectsForAgent } from '@kube-agents/mail';
import { upsertRun, addSpan } from './trace-store.js';

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

export async function initTraceConsumer(): Promise<void> {
  if (!js) return;
  try {
    // Check if the trace stream exists
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

          if (subject.startsWith('trace.run.')) {
            upsertRun(raw as TraceRun);
          } else if (subject.startsWith('trace.span.')) {
            addSpan(raw as TraceSpan);
          }
        } catch (err) {
          console.error('[nats-client] Failed to decode trace event:', err);
        }
      }
    })().catch(() => {
      // consumer ended
    });

    console.log('[nats-client] Trace consumer started');
  } catch (err) {
    console.warn('[nats-client] Failed to start trace consumer:', err);
  }
}

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

  // Use an ordered consumer with subject filtering
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

  // Sort newest first
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

  // Sort chronologically for thread view
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
