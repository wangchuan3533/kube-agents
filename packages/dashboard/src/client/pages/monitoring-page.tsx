import { useMonitoring } from '../hooks/use-monitoring.js';
import type { TimeSeriesPoint, ModelUsage, ErrorRate, ProjectStats } from '../types.js';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function MonitoringPage() {
  const { data, loading, error, refresh } = useMonitoring();

  if (loading) return <div className="text-gray-400 text-center py-12">Loading monitoring data...</div>;
  if (error) return <div className="text-red-400 text-center py-12">{error}</div>;
  if (!data) return null;

  const { summary, timeseries, models, errors, projectStats } = data;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Monitoring</h1>
        <button
          onClick={refresh}
          className="px-3 py-1.5 bg-gray-700 text-gray-300 rounded text-sm hover:bg-gray-600"
        >
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8">
        <MetricBox label="Total Traces" value={String(summary.totalTraces)} />
        <MetricBox label="Projects" value={String(summary.projectCount)} />
        <MetricBox label="Total Tokens" value={formatTokens(summary.totalTokens)} color="text-blue-400" />
        <MetricBox label="Avg Latency" value={summary.avgLatencyMs != null ? `${summary.avgLatencyMs.toFixed(0)}ms` : '-'} />
        <MetricBox label="Errors" value={String(summary.totalErrors)} color={summary.totalErrors > 0 ? 'text-red-400' : 'text-white'} />
        <MetricBox label="Error Rate" value={`${(summary.errorRate * 100).toFixed(1)}%`} color={summary.errorRate > 0.1 ? 'text-red-400' : 'text-green-400'} />
      </div>

      {/* Time series chart */}
      {timeseries.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-3">Trace Volume (Last 24h)</h2>
          <BarChart data={timeseries} />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        {/* Model usage */}
        {models.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-3">Model Usage</h2>
            <ModelUsageTable models={models} />
          </div>
        )}

        {/* Error rates */}
        {errors.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-3">Error Rates by Project</h2>
            <ErrorRateTable errors={errors} />
          </div>
        )}
      </div>

      {/* Project stats */}
      {projectStats.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-3">Project Activity</h2>
          <ProjectStatsTable stats={projectStats} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bar chart (CSS-based)
// ---------------------------------------------------------------------------

function BarChart({ data }: { data: TimeSeriesPoint[] }) {
  const maxCount = Math.max(...data.map((d) => d.traceCount), 1);

  return (
    <div className="bg-gray-800/60 rounded-lg border border-gray-700 p-4">
      <div className="flex items-end gap-1 h-32">
        {data.map((point, i) => {
          const height = (point.traceCount / maxCount) * 100;
          const errorHeight = (point.errorCount / maxCount) * 100;
          return (
            <div
              key={i}
              className="flex-1 flex flex-col items-center justify-end h-full group relative"
            >
              {/* Tooltip */}
              <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                <div className="bg-gray-900 border border-gray-600 rounded p-2 text-xs text-gray-300 whitespace-nowrap">
                  <div>{formatTime(point.bucket)}</div>
                  <div>Traces: {point.traceCount}</div>
                  {point.errorCount > 0 && <div className="text-red-400">Errors: {point.errorCount}</div>}
                  <div>Tokens: {formatTokens(point.totalTokens)}</div>
                  {point.avgLatencyMs != null && <div>Avg: {point.avgLatencyMs.toFixed(0)}ms</div>}
                </div>
              </div>
              {/* Error bar */}
              {point.errorCount > 0 && (
                <div
                  className="w-full bg-red-500/60 rounded-t-sm"
                  style={{ height: `${errorHeight}%`, minHeight: point.errorCount > 0 ? '2px' : '0' }}
                />
              )}
              {/* Success bar */}
              <div
                className="w-full bg-blue-500/70 rounded-t-sm"
                style={{ height: `${Math.max(height - errorHeight, 0)}%`, minHeight: point.traceCount > 0 ? '2px' : '0' }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-2 text-xs text-gray-500">
        {data.length > 0 && <span>{formatTime(data[0].bucket)}</span>}
        {data.length > 1 && <span>{formatTime(data[data.length - 1].bucket)}</span>}
      </div>
      <div className="flex gap-4 mt-2 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-3 h-2 bg-blue-500/70 rounded-sm inline-block" /> Traces
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-2 bg-red-500/60 rounded-sm inline-block" /> Errors
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

function ModelUsageTable({ models }: { models: ModelUsage[] }) {
  return (
    <div className="bg-gray-800/60 rounded-lg border border-gray-700 overflow-hidden">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-700 text-gray-400">
            <th className="py-2 px-3">Model</th>
            <th className="py-2 px-3">Provider</th>
            <th className="py-2 px-3 text-right">Calls</th>
            <th className="py-2 px-3 text-right">Tokens</th>
            <th className="py-2 px-3 text-right">Avg Latency</th>
          </tr>
        </thead>
        <tbody>
          {models.map((m, i) => (
            <tr key={i} className="border-b border-gray-800">
              <td className="py-2 px-3 text-white font-mono text-xs">{m.model}</td>
              <td className="py-2 px-3 text-gray-400">{m.provider}</td>
              <td className="py-2 px-3 text-gray-300 text-right">{m.callCount}</td>
              <td className="py-2 px-3 text-blue-400 text-right">{formatTokens(m.totalTokens)}</td>
              <td className="py-2 px-3 text-gray-400 text-right">
                {m.avgLatencyMs != null ? `${m.avgLatencyMs.toFixed(0)}ms` : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ErrorRateTable({ errors }: { errors: ErrorRate[] }) {
  return (
    <div className="bg-gray-800/60 rounded-lg border border-gray-700 overflow-hidden">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-700 text-gray-400">
            <th className="py-2 px-3">Project</th>
            <th className="py-2 px-3 text-right">Total</th>
            <th className="py-2 px-3 text-right">Errors</th>
            <th className="py-2 px-3 text-right">Rate</th>
          </tr>
        </thead>
        <tbody>
          {errors.map((e) => (
            <tr key={e.projectId} className="border-b border-gray-800">
              <td className="py-2 px-3 text-white">{e.projectName}</td>
              <td className="py-2 px-3 text-gray-300 text-right">{e.total}</td>
              <td className="py-2 px-3 text-right">
                <span className={e.errors > 0 ? 'text-red-400' : 'text-gray-400'}>{e.errors}</span>
              </td>
              <td className="py-2 px-3 text-right">
                <span className={e.rate > 0.1 ? 'text-red-400' : 'text-green-400'}>
                  {(e.rate * 100).toFixed(1)}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProjectStatsTable({ stats }: { stats: ProjectStats[] }) {
  return (
    <div className="bg-gray-800/60 rounded-lg border border-gray-700 overflow-hidden">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-700 text-gray-400">
            <th className="py-2 px-3">Project</th>
            <th className="py-2 px-3 text-right">Traces</th>
            <th className="py-2 px-3 text-right">Runs</th>
            <th className="py-2 px-3 text-right">Tokens</th>
            <th className="py-2 px-3 text-right">Avg Latency</th>
            <th className="py-2 px-3 text-right">Errors</th>
            <th className="py-2 px-3 text-right">Last Active</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((s) => (
            <tr key={s.projectId} className="border-b border-gray-800">
              <td className="py-2 px-3 text-white">{s.projectName}</td>
              <td className="py-2 px-3 text-gray-300 text-right">{s.traceCount}</td>
              <td className="py-2 px-3 text-gray-300 text-right">{s.runCount}</td>
              <td className="py-2 px-3 text-blue-400 text-right">{formatTokens(s.totalTokens)}</td>
              <td className="py-2 px-3 text-gray-400 text-right">
                {s.avgLatencyMs != null ? `${s.avgLatencyMs.toFixed(0)}ms` : '-'}
              </td>
              <td className="py-2 px-3 text-right">
                <span className={s.errorCount > 0 ? 'text-red-400' : 'text-gray-400'}>
                  {s.errorCount}
                </span>
              </td>
              <td className="py-2 px-3 text-gray-500 text-right text-xs">
                {s.lastTraceAt ? new Date(s.lastTraceAt).toLocaleString() : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
