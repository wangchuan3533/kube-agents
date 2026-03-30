import { useState, useEffect, useCallback } from 'react';
import type { ExperimentData, ExperimentResultData, FeedbackData } from '../types.js';

interface ExperimentsState {
  experiments: ExperimentData[];
  loading: boolean;
  error: string | null;
}

export function useExperiments(datasetId?: string) {
  const [state, setState] = useState<ExperimentsState>({ experiments: [], loading: true, error: null });

  const refresh = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    const url = datasetId ? `/api/experiments?datasetId=${datasetId}` : '/api/experiments';
    fetch(url)
      .then((r) => r.json())
      .then((data: { experiments: ExperimentData[] }) => {
        setState({ experiments: data.experiments, loading: false, error: null });
      })
      .catch((err) => {
        setState((s) => ({ ...s, loading: false, error: err.message }));
      });
  }, [datasetId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { ...state, refresh };
}

interface ExperimentDetailState {
  experiment: ExperimentData | null;
  results: ExperimentResultData[];
  feedback: FeedbackData[];
  loading: boolean;
  error: string | null;
}

export function useExperimentDetail(experimentId: string) {
  const [state, setState] = useState<ExperimentDetailState>({
    experiment: null, results: [], feedback: [], loading: true, error: null,
  });

  const refresh = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));

    fetch(`/api/experiments/${experimentId}`)
      .then((r) => r.json())
      .then((data: { experiment: ExperimentData; results: ExperimentResultData[] }) => {
        // Collect feedback for all traces referenced by results
        const traceIds = data.results
          .filter((r) => r.traceId)
          .map((r) => r.traceId!);
        const uniqueTraceIds = [...new Set(traceIds)];

        return Promise.all(
          uniqueTraceIds.map((tid) =>
            fetch(`/api/traces/${tid}/feedback`)
              .then((r) => r.json())
              .then((fb: { feedback: FeedbackData[] }) => fb.feedback),
          ),
        ).then((feedbackArrays) => {
          setState({
            experiment: data.experiment,
            results: data.results,
            feedback: feedbackArrays.flat(),
            loading: false,
            error: null,
          });
        });
      })
      .catch((err) => {
        setState((s) => ({ ...s, loading: false, error: err.message }));
      });
  }, [experimentId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { ...state, refresh };
}
