import { useState } from 'react';
import { useTraces } from '../hooks/use-traces.js';
import { MetricCard } from '../components/metric-card.js';
import { TraceRunTable } from '../components/trace-run-table.js';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatAvgLatency(runs: Array<{ totalLatencyMs?: number }>): string {
  const valid = runs.filter((r) => r.totalLatencyMs !== undefined);
  if (valid.length === 0) return '—';
  const avg = valid.reduce((sum, r) => sum + r.totalLatencyMs!, 0) / valid.length;
  if (avg >= 60_000) return `${(avg / 60_000).toFixed(1)}m`;
  if (avg >= 1_000) return `${(avg / 1_000).toFixed(1)}s`;
  return `${Math.round(avg)}ms`;
}

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'error', label: 'Error' },
];

export function TracesPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const { runs, total, loading, error, refresh } = useTraces({
    status: statusFilter || undefined,
  });

  const totalTokens = runs.reduce((s, r) => s + r.totalTokens, 0);
  const errorCount = runs.filter((r) => r.status === 'error').length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <a href="#/" className="text-blue-400 hover:text-blue-300 text-sm mb-2 inline-block">
            ← Dashboard
          </a>
          <h1 className="text-2xl font-bold text-white">Traces</h1>
          <p className="text-gray-400 text-sm mt-1">LLM call tracing and tool execution inspection</p>
        </div>
        <button
          onClick={refresh}
          className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-sm border border-gray-700 transition-colors"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-6 p-3 bg-red-900/30 border border-red-800 rounded text-red-300 text-sm">
          Error: {error}
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Total Runs" value={total} />
        <MetricCard label="Avg Latency" value={formatAvgLatency(runs)} color="text-blue-400" />
        <MetricCard label="Total Tokens" value={formatTokens(totalTokens)} color="text-purple-400" />
        <MetricCard
          label="Errors"
          value={errorCount}
          color={errorCount > 0 ? 'text-red-400' : 'text-white'}
        />
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs text-gray-500 uppercase tracking-wide">Status:</span>
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setStatusFilter(opt.value)}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              statusFilter === opt.value
                ? 'bg-blue-900/50 text-blue-300 border border-blue-700'
                : 'bg-gray-800 text-gray-400 border border-gray-700 hover:text-gray-300'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <TraceRunTable runs={runs} loading={loading} />
    </div>
  );
}
