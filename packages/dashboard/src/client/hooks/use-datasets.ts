import { useState, useEffect, useCallback } from 'react';
import type { DatasetData, ExampleData } from '../types.js';

interface DatasetsState {
  datasets: DatasetData[];
  loading: boolean;
  error: string | null;
}

export function useDatasets() {
  const [state, setState] = useState<DatasetsState>({ datasets: [], loading: true, error: null });

  const refresh = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    fetch('/api/datasets')
      .then((r) => r.json())
      .then((data: { datasets: DatasetData[] }) => {
        setState({ datasets: data.datasets, loading: false, error: null });
      })
      .catch((err) => {
        setState((s) => ({ ...s, loading: false, error: err.message }));
      });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { ...state, refresh };
}

interface DatasetDetailState {
  dataset: DatasetData | null;
  examples: ExampleData[];
  loading: boolean;
  error: string | null;
}

export function useDatasetDetail(datasetId: string) {
  const [state, setState] = useState<DatasetDetailState>({
    dataset: null, examples: [], loading: true, error: null,
  });

  const refresh = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));

    Promise.all([
      fetch(`/api/datasets/${datasetId}`).then((r) => r.json()),
      fetch(`/api/datasets/${datasetId}/examples`).then((r) => r.json()),
    ])
      .then(([datasetRes, examplesRes]) => {
        setState({
          dataset: (datasetRes as { dataset: DatasetData }).dataset,
          examples: (examplesRes as { examples: ExampleData[] }).examples,
          loading: false,
          error: null,
        });
      })
      .catch((err) => {
        setState((s) => ({ ...s, loading: false, error: err.message }));
      });
  }, [datasetId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { ...state, refresh };
}
