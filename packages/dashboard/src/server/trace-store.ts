import type { TraceRun, TraceSpan } from '@kube-agents/core';

const MAX_RUNS = 1000;

const runs = new Map<string, TraceRun>();
const spans = new Map<string, TraceSpan[]>();
const runOrder: string[] = []; // oldest first for eviction

export function upsertRun(run: TraceRun): void {
  if (!runs.has(run.id)) {
    runOrder.push(run.id);
    // Evict oldest if over capacity
    while (runOrder.length > MAX_RUNS) {
      const oldId = runOrder.shift()!;
      runs.delete(oldId);
      spans.delete(oldId);
    }
  }
  runs.set(run.id, run);
}

export function addSpan(span: TraceSpan): void {
  const existing = spans.get(span.runId);
  if (existing) {
    existing.push(span);
  } else {
    spans.set(span.runId, [span]);
  }
}

export interface TraceListOptions {
  agentName?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface TraceListResult {
  runs: TraceRun[];
  total: number;
  hasMore: boolean;
}

export function listRuns(options: TraceListOptions = {}): TraceListResult {
  const { agentName, status, limit = 50, offset = 0 } = options;

  let allRuns = Array.from(runs.values());

  if (agentName) {
    allRuns = allRuns.filter((r) => r.agentName === agentName);
  }
  if (status) {
    allRuns = allRuns.filter((r) => r.status === status);
  }

  // Sort newest first
  allRuns.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  const total = allRuns.length;
  const sliced = allRuns.slice(offset, offset + limit);

  return {
    runs: sliced,
    total,
    hasMore: offset + limit < total,
  };
}

export function getRun(runId: string): TraceRun | undefined {
  return runs.get(runId);
}

export function getSpans(runId: string): TraceSpan[] {
  return spans.get(runId) ?? [];
}

export function getRunCount(): number {
  return runs.size;
}
