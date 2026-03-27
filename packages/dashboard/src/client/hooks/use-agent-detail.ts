import { useState, useEffect, useCallback } from 'react';
import type { AgentDetailData } from '../types.js';

export function useAgentDetail(namespace: string, name: string) {
  const [agent, setAgent] = useState<AgentDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/agents/${namespace}/${name}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: AgentDetailData = await res.json();
      setAgent(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [namespace, name]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { agent, error, loading, refresh };
}
