import { useState, useEffect, useCallback } from 'react';
import type { TraceData, TraceListResponse } from '../types.js';

const POLL_INTERVAL = 5000;

interface UseTracesOptions {
  agentName?: string;
  status?: string;
}

export function useTraces(options: UseTracesOptions = {}) {
  const [traces, setTraces] = useState<TraceData[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (options.agentName) params.set('agentName', options.agentName);
      if (options.status) params.set('status', options.status);
      params.set('limit', '100');

      const res = await fetch(`/api/traces?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: TraceListResponse = await res.json();
      setTraces(json.traces);
      setTotal(json.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [options.agentName, options.status]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [refresh]);

  return { traces, total, loading, error, refresh };
}
