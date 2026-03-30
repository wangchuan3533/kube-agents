import { useState, useEffect, useCallback } from 'react';
import type { MonitoringData } from '../types.js';

interface MonitoringState {
  data: MonitoringData | null;
  loading: boolean;
  error: string | null;
}

export function useMonitoring() {
  const [state, setState] = useState<MonitoringState>({ data: null, loading: true, error: null });

  const refresh = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    fetch('/api/monitoring/summary')
      .then((r) => r.json())
      .then((data: MonitoringData) => {
        setState({ data, loading: false, error: null });
      })
      .catch((err) => {
        setState((s) => ({ ...s, loading: false, error: err.message }));
      });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { ...state, refresh };
}
