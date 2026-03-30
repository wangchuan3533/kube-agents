import { useState, useEffect, useCallback } from 'react';
import type { TraceData, RunData, FeedbackData, TraceDetailResponse } from '../types.js';

const POLL_INTERVAL = 5000;

export function useTraceDetail(traceId: string) {
  const [trace, setTrace] = useState<TraceData | null>(null);
  const [runs, setRuns] = useState<RunData[]>([]);
  const [feedback, setFeedback] = useState<FeedbackData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/traces/${traceId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: TraceDetailResponse = await res.json();
      setTrace(json.trace);
      setRuns(json.runs);
      setFeedback(json.feedback);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [traceId]);

  useEffect(() => {
    refresh();
    const interval = setInterval(() => {
      if (trace?.status === 'running') refresh();
    }, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [refresh, trace?.status]);

  return { trace, runs, feedback, loading, error, refresh };
}
