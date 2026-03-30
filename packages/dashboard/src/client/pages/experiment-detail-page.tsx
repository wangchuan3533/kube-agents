import { useExperimentDetail } from '../hooks/use-experiments.js';
import type { ExperimentResultData, FeedbackData } from '../types.js';

export function ExperimentDetailPage({ experimentId }: { experimentId: string }) {
  const { experiment, results, feedback, loading, error } = useExperimentDetail(experimentId);

  if (loading) return <div className="text-gray-400 text-center py-12">Loading...</div>;
  if (error) return <div className="text-red-400 text-center py-12">{error}</div>;
  if (!experiment) return <div className="text-gray-400 text-center py-12">Experiment not found</div>;

  const successCount = results.filter((r) => !r.error).length;
  const errorCount = results.filter((r) => r.error).length;
  const latencies = results.filter((r) => r.latencyMs != null).map((r) => r.latencyMs!);
  const avgLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null;
  const totalTokens = results.reduce((sum, r) => sum + (r.totalTokens ?? 0), 0);

  // Aggregate feedback scores by key
  const scoresByKey = new Map<string, number[]>();
  for (const fb of feedback) {
    if (fb.score != null) {
      const arr = scoresByKey.get(fb.key) ?? [];
      arr.push(fb.score);
      scoresByKey.set(fb.key, arr);
    }
  }

  const statusColors: Record<string, string> = {
    running: 'bg-yellow-900/50 text-yellow-300',
    completed: 'bg-green-900/50 text-green-300',
    error: 'bg-red-900/50 text-red-300',
  };

  return (
    <div>
      <div className="mb-6">
        <a href="#experiments" className="text-gray-400 hover:text-gray-300 text-sm">
          &larr; Experiments
        </a>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{experiment.name}</h1>
          {experiment.description && (
            <p className="text-gray-400 mt-1">{experiment.description}</p>
          )}
        </div>
        <span className={`px-2 py-1 rounded text-sm ${statusColors[experiment.status] ?? ''}`}>
          {experiment.status}
        </span>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <MetricBox label="Examples" value={String(results.length)} />
        <MetricBox label="Success" value={String(successCount)} color="text-green-400" />
        <MetricBox label="Errors" value={String(errorCount)} color={errorCount > 0 ? 'text-red-400' : 'text-white'} />
        <MetricBox label="Avg Latency" value={avgLatency != null ? `${avgLatency.toFixed(0)}ms` : '-'} />
        <MetricBox label="Total Tokens" value={String(totalTokens)} color="text-blue-400" />
      </div>

      {/* Evaluator scores */}
      {scoresByKey.size > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-3">Evaluator Scores</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...scoresByKey.entries()].map(([key, scores]) => {
              const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
              return (
                <div key={key} className="bg-gray-800/60 rounded-lg border border-gray-700 p-4">
                  <div className="text-gray-400 text-xs mb-1">{key}</div>
                  <div className="text-2xl font-bold text-white">
                    {(avg * 100).toFixed(0)}%
                  </div>
                  <div className="text-gray-500 text-xs mt-1">{scores.length} evaluations</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Results table */}
      <h2 className="text-lg font-semibold text-white mb-3">Results</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-700 text-gray-400">
              <th className="py-2 px-3">Example</th>
              <th className="py-2 px-3">Status</th>
              <th className="py-2 px-3">Latency</th>
              <th className="py-2 px-3">Tokens</th>
              <th className="py-2 px-3">Scores</th>
              <th className="py-2 px-3">Output</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => (
              <ResultRow
                key={result.id}
                result={result}
                feedback={feedback.filter((f) => f.traceId === result.traceId)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ResultRow({ result, feedback }: { result: ExperimentResultData; feedback: FeedbackData[] }) {
  return (
    <tr className="border-b border-gray-800 hover:bg-gray-800/40">
      <td className="py-2 px-3 text-gray-300 font-mono text-xs">
        {result.exampleId.slice(0, 8)}...
      </td>
      <td className="py-2 px-3">
        {result.error ? (
          <span className="text-red-400 text-xs" title={result.error}>Error</span>
        ) : (
          <span className="text-green-400 text-xs">OK</span>
        )}
      </td>
      <td className="py-2 px-3 text-gray-400">
        {result.latencyMs != null ? `${result.latencyMs.toFixed(0)}ms` : '-'}
      </td>
      <td className="py-2 px-3 text-gray-400">
        {result.totalTokens ?? '-'}
      </td>
      <td className="py-2 px-3">
        {feedback.length > 0 ? (
          <div className="flex gap-1">
            {feedback.map((fb) => (
              <span
                key={fb.id}
                className={`px-1.5 py-0.5 rounded text-xs ${
                  (fb.score ?? 0) >= 0.7
                    ? 'bg-green-900/50 text-green-300'
                    : (fb.score ?? 0) >= 0.4
                      ? 'bg-yellow-900/50 text-yellow-300'
                      : 'bg-red-900/50 text-red-300'
                }`}
                title={fb.comment ?? undefined}
              >
                {fb.key}: {fb.score != null ? (fb.score * 100).toFixed(0) + '%' : fb.value}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-gray-600 text-xs">-</span>
        )}
      </td>
      <td className="py-2 px-3 text-gray-400 text-xs max-w-xs truncate">
        {result.outputs
          ? JSON.stringify(result.outputs).slice(0, 80)
          : '-'}
      </td>
    </tr>
  );
}

function MetricBox({ label, value, color = 'text-white' }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-gray-800/60 rounded-lg border border-gray-700 p-4">
      <div className="text-gray-400 text-xs mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
