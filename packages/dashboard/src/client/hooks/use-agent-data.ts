import { useState, useEffect, useCallback } from 'react';
import type { OverviewData } from '../types.js';

const POLL_INTERVAL = 5000;

export function useAgentData() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/overview');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: OverviewData = await res.json();
      setData(json);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [refresh]);

  return { data, error, lastUpdated, refresh };
}
