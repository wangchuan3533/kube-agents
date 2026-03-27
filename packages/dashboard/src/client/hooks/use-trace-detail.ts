import { useState, useEffect, useCallback } from 'react';
import type { TraceRun, TraceSpan, TraceDetailResponse } from '../types.js';

const POLL_INTERVAL = 5000;

export function useTraceDetail(runId: string) {
  const [run, setRun] = useState<TraceRun | null>(null);
  const [spans, setSpans] = useState<TraceSpan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/traces/${runId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: TraceDetailResponse = await res.json();
      setRun(json.run);
      setSpans(json.spans);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    refresh();
    // Poll while run is in progress
    const interval = setInterval(() => {
      if (run?.status === 'running') refresh();
    }, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [refresh, run?.status]);

  return { run, spans, loading, error, refresh };
}
