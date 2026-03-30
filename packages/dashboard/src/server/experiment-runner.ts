import { randomUUID } from 'node:crypto';
import type { Experiment, ExperimentResult, Feedback } from '@kube-agents/core';
import {
  getDataset,
  listExamples,
  insertExperiment,
  updateExperiment,
  insertExperimentResult,
  insertFeedback,
  listFeedbackForTrace,
} from './db.js';
import { runEvaluators, type EvaluatorConfig, type EvaluationInput } from './evaluators.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RunExperimentOptions {
  name: string;
  datasetId: string;
  description?: string;
  /** Function that processes an example's inputs and returns outputs */
  runFn: (inputs: Record<string, unknown>) => Promise<{
    outputs: Record<string, unknown>;
    traceId?: string;
    latencyMs?: number;
    totalTokens?: number;
  }>;
  evaluators?: EvaluatorConfig[];
  metadata?: Record<string, string>;
  split?: string;
}

export interface ExperimentSummary {
  experiment: Experiment;
  results: ExperimentResult[];
  feedback: Feedback[];
  avgScore: number | null;
  avgLatencyMs: number | null;
  totalTokens: number;
  errorCount: number;
}

// ---------------------------------------------------------------------------
// Experiment runner
// ---------------------------------------------------------------------------

export async function runExperiment(options: RunExperimentOptions): Promise<ExperimentSummary> {
  const { name, datasetId, description, runFn, evaluators = [], metadata = {}, split } = options;

  const dataset = getDataset(datasetId);
  if (!dataset) {
    throw new Error(`Dataset not found: ${datasetId}`);
  }

  const examples = listExamples(datasetId, split);
  if (examples.length === 0) {
    throw new Error(`Dataset "${dataset.name}" has no examples${split ? ` in split "${split}"` : ''}`);
  }

  const now = new Date();
  const experiment: Experiment = {
    id: randomUUID(),
    name,
    datasetId,
    description,
    metadata,
    status: 'running',
    createdAt: now,
    completedAt: undefined,
  };
  insertExperiment(experiment);

  const results: ExperimentResult[] = [];
  const allFeedback: Feedback[] = [];
  let errorCount = 0;

  for (const example of examples) {
    const resultId = randomUUID();
    let result: ExperimentResult;

    try {
      const start = Date.now();
      const output = await runFn(example.inputs);
      const elapsed = output.latencyMs ?? (Date.now() - start);

      result = {
        id: resultId,
        experimentId: experiment.id,
        exampleId: example.id,
        traceId: output.traceId,
        outputs: output.outputs,
        latencyMs: elapsed,
        totalTokens: output.totalTokens,
        error: undefined,
        createdAt: new Date(),
      };

      // Run evaluators on this result
      if (evaluators.length > 0 && output.traceId) {
        const evalInput: EvaluationInput = {
          traceId: output.traceId,
          inputs: example.inputs,
          outputs: output.outputs,
          expectedOutputs: example.expectedOutputs,
        };
        const feedback = await runEvaluators(evaluators, evalInput);
        for (const fb of feedback) {
          insertFeedback(fb);
          allFeedback.push(fb);
        }
      }
    } catch (err) {
      errorCount++;
      result = {
        id: resultId,
        experimentId: experiment.id,
        exampleId: example.id,
        traceId: undefined,
        outputs: undefined,
        latencyMs: undefined,
        totalTokens: undefined,
        error: err instanceof Error ? err.message : String(err),
        createdAt: new Date(),
      };
    }

    insertExperimentResult(result);
    results.push(result);
  }

  // Mark experiment as completed
  const completedAt = new Date();
  updateExperiment(experiment.id, {
    status: errorCount === examples.length ? 'error' : 'completed',
    completedAt,
  });
  experiment.status = errorCount === examples.length ? 'error' : 'completed';
  experiment.completedAt = completedAt;

  // Compute summary stats
  const latencies = results.filter((r) => r.latencyMs != null).map((r) => r.latencyMs!);
  const avgLatencyMs = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null;
  const totalTokens = results.reduce((sum, r) => sum + (r.totalTokens ?? 0), 0);

  const scores = allFeedback.filter((f) => f.score != null).map((f) => f.score!);
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

  return {
    experiment,
    results,
    feedback: allFeedback,
    avgScore,
    avgLatencyMs,
    totalTokens,
    errorCount,
  };
}

// ---------------------------------------------------------------------------
// Simple "echo" runner for manual evaluation (no agent invocation)
// ---------------------------------------------------------------------------

/**
 * Creates a simple experiment that records example inputs as outputs
 * (useful for manual annotation / human evaluation workflows).
 */
export async function runManualExperiment(
  name: string,
  datasetId: string,
  evaluators: EvaluatorConfig[] = [],
  metadata: Record<string, string> = {},
): Promise<ExperimentSummary> {
  return runExperiment({
    name,
    datasetId,
    metadata,
    runFn: async (inputs) => ({
      outputs: inputs,
      latencyMs: 0,
      totalTokens: 0,
    }),
    evaluators,
  });
}
