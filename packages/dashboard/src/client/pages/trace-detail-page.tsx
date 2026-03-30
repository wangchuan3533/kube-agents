import { useTraceDetail } from '../hooks/use-trace-detail.js';
import { MetricCard } from '../components/metric-card.js';
import { RunTimeline } from '../components/span-timeline.js';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatLatency(ms: number | undefined): string {
  if (ms === undefined) return '...';
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
  if (ms >= 1_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${ms}ms`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

const STATUS_COLORS: Record<string, string> = {
  running: 'bg-blue-900 text-blue-300 border-blue-700',
  completed: 'bg-green-900 text-green-300 border-green-700',
  error: 'bg-red-900 text-red-300 border-red-700',
};

interface TraceDetailPageProps {
  traceId: string;
}

export function TraceDetailPage({ traceId }: TraceDetailPageProps) {
  const { trace, runs, feedback, loading, error, refresh } = useTraceDetail(traceId);

  if (loading && !trace) {
    return <div className="text-gray-500 text-sm py-12 text-center">Loading trace...</div>;
  }

  if (error || !trace) {
    return (
      <div>
        <a href="#/traces" className="text-blue-400 hover:text-blue-300 text-sm mb-4 inline-block">
          ← All Traces
        </a>
        <div className="p-4 bg-red-900/30 border border-red-800 rounded text-red-300 text-sm">
          {error ?? 'Trace not found'}
        </div>
      </div>
    );
  }

  const llmRuns = runs.filter((r) => r.runType === 'llm');
  const toolRuns = runs.filter((r) => r.runType === 'tool');

  return (
    <div>
      {/* Navigation */}
      <a href="#/traces" className="text-blue-400 hover:text-blue-300 text-sm mb-4 inline-block">
        ← All Traces
      </a>

      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white">{trace.name}</h1>
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${STATUS_COLORS[trace.status] ?? 'bg-gray-800 text-gray-400 border-gray-600'}`}>
            {trace.status}
          </span>
        </div>
        <button
          onClick={refresh}
          className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-sm border border-gray-700 transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="text-gray-500 text-xs mb-6">
        Started: {formatTime(trace.startedAt)}
        {trace.completedAt && <span> | Completed: {formatTime(trace.completedAt)}</span>}
        {trace.sessionId && <span> | Session: <span className="font-mono">{trace.sessionId.slice(0, 12)}...</span></span>}
        {' | '}ID: <span className="font-mono">{trace.id.slice(0, 12)}...</span>
      </div>

      {/* Tags */}
      {trace.tags.length > 0 && (
        <div className="flex gap-1 mb-4">
          {trace.tags.map((tag) => (
            <span key={tag} className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded">{tag}</span>
          ))}
        </div>
      )}

      {trace.error && (
        <div className="mb-6 p-3 bg-red-900/30 border border-red-800 rounded text-red-300 text-sm font-mono">
          {trace.error}
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <MetricCard label="Total Latency" value={formatLatency(trace.totalLatencyMs)} color="text-blue-400" />
        <MetricCard label="Total Runs" value={runs.length} />
        <MetricCard label="Total Tokens" value={formatTokens(trace.totalTokens)} color="text-purple-400" />
        <MetricCard label="LLM Calls" value={llmRuns.length} color="text-blue-400" />
        <MetricCard label="Tool Calls" value={toolRuns.length} color="text-green-400" />
      </div>

      {/* Token breakdown */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <MetricCard label="Prompt Tokens" value={formatTokens(trace.promptTokens)} />
        <MetricCard label="Completion Tokens" value={formatTokens(trace.completionTokens)} />
        <MetricCard label="Total Tokens" value={formatTokens(trace.totalTokens)} color="text-purple-400" />
      </div>

      {/* Feedback */}
      {feedback.length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">
            Feedback ({feedback.length})
          </h3>
          <div className="space-y-2">
            {feedback.map((fb) => (
              <div key={fb.id} className="bg-gray-900 border border-gray-800 rounded-lg p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${fb.source === 'human' ? 'bg-blue-900/50 text-blue-300' : fb.source === 'llm' ? 'bg-purple-900/50 text-purple-300' : 'bg-gray-800 text-gray-400'}`}>
                    {fb.source}
                  </span>
                  <span className="text-sm text-white font-medium">{fb.key}</span>
                  {fb.comment && <span className="text-xs text-gray-400">{fb.comment}</span>}
                </div>
                <div className="flex items-center gap-2">
                  {fb.score != null && (
                    <span className="text-sm font-mono text-yellow-400">{fb.score.toFixed(2)}</span>
                  )}
                  {fb.value && (
                    <span className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded">{fb.value}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Run Timeline */}
      <div>
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">
          Execution Timeline ({runs.length} runs)
        </h3>
        <RunTimeline runs={runs} />
      </div>
    </div>
  );
}
