import { useTraceDetail } from '../hooks/use-trace-detail.js';
import { MetricCard } from '../components/metric-card.js';
import { SpanTimeline } from '../components/span-timeline.js';

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
  runId: string;
}

export function TraceDetailPage({ runId }: TraceDetailPageProps) {
  const { run, spans, loading, error, refresh } = useTraceDetail(runId);

  if (loading && !run) {
    return <div className="text-gray-500 text-sm py-12 text-center">Loading trace...</div>;
  }

  if (error || !run) {
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

  const llmSpans = spans.filter((s) => s.type === 'llm_call');
  const toolSpans = spans.filter((s) => s.type === 'tool_call');

  return (
    <div>
      {/* Navigation */}
      <a href="#/traces" className="text-blue-400 hover:text-blue-300 text-sm mb-4 inline-block">
        ← All Traces
      </a>

      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white">{run.agentName}</h1>
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${STATUS_COLORS[run.status] ?? 'bg-gray-800 text-gray-400 border-gray-600'}`}>
            {run.status}
          </span>
        </div>
        <button
          onClick={refresh}
          className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-sm border border-gray-700 transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="text-gray-400 text-sm mb-1 font-mono">{run.agentEmail}</div>
      <div className="text-gray-500 text-xs mb-6">
        Started: {formatTime(run.startedAt)}
        {run.completedAt && <span> | Completed: {formatTime(run.completedAt)}</span>}
        {' | '}Email ID: <span className="font-mono">{run.emailId.slice(0, 12)}...</span>
        {run.threadId && <span> | Thread: <span className="font-mono">{run.threadId.slice(0, 12)}...</span></span>}
      </div>

      {run.error && (
        <div className="mb-6 p-3 bg-red-900/30 border border-red-800 rounded text-red-300 text-sm font-mono">
          {run.error}
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <MetricCard label="Total Latency" value={formatLatency(run.totalLatencyMs)} color="text-blue-400" />
        <MetricCard label="Iterations" value={run.iterationCount} />
        <MetricCard label="Total Tokens" value={formatTokens(run.totalTokens)} color="text-purple-400" />
        <MetricCard label="LLM Calls" value={llmSpans.length} color="text-blue-400" />
        <MetricCard label="Tool Calls" value={toolSpans.length} color="text-green-400" />
      </div>

      {/* Token breakdown */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <MetricCard label="Prompt Tokens" value={formatTokens(run.promptTokens)} />
        <MetricCard label="Completion Tokens" value={formatTokens(run.completionTokens)} />
        <MetricCard label="Total Tokens" value={formatTokens(run.totalTokens)} color="text-purple-400" />
      </div>

      {/* Span Timeline */}
      <div>
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">
          Execution Timeline ({spans.length} spans)
        </h3>
        <SpanTimeline spans={spans} />
      </div>
    </div>
  );
}
