import type { TraceData } from '../types.js';

const STATUS_COLORS: Record<string, string> = {
  running: 'bg-blue-900 text-blue-300 border-blue-700',
  completed: 'bg-green-900 text-green-300 border-green-700',
  error: 'bg-red-900 text-red-300 border-red-700',
};

function formatLatency(ms: number | undefined): string {
  if (ms === undefined) return '...';
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
  if (ms >= 1_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${ms}ms`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString();
}

interface TraceRunTableProps {
  traces: TraceData[];
  loading?: boolean;
}

export function TraceRunTable({ traces, loading }: TraceRunTableProps) {
  if (loading) {
    return <div className="text-gray-500 text-sm py-8 text-center">Loading traces...</div>;
  }

  if (traces.length === 0) {
    return (
      <div className="text-gray-500 text-sm py-8 text-center border border-gray-800 rounded-lg bg-gray-900/50">
        No traces yet. Send a task to an agent to generate traces.
      </div>
    );
  }

  return (
    <div className="border border-gray-800 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-900 text-gray-400 text-xs uppercase tracking-wide">
            <th className="text-left px-4 py-3">Name</th>
            <th className="text-left px-4 py-3">Status</th>
            <th className="text-right px-4 py-3">Tokens</th>
            <th className="text-right px-4 py-3">Latency</th>
            <th className="text-left px-4 py-3">Tags</th>
            <th className="text-right px-4 py-3">Time</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {traces.map((trace) => (
            <tr
              key={trace.id}
              className="hover:bg-gray-800/50 cursor-pointer transition-colors"
              onClick={() => { window.location.hash = `#/traces/${trace.id}`; }}
            >
              <td className="px-4 py-3">
                <div className="text-white font-medium">{trace.name}</div>
                <div className="text-gray-500 text-xs font-mono">{trace.id.slice(0, 8)}...</div>
              </td>
              <td className="px-4 py-3">
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${STATUS_COLORS[trace.status] ?? 'bg-gray-800 text-gray-400 border-gray-600'}`}>
                  {trace.status}
                </span>
              </td>
              <td className="px-4 py-3 text-right text-purple-400">{formatTokens(trace.totalTokens)}</td>
              <td className="px-4 py-3 text-right text-gray-300">{formatLatency(trace.totalLatencyMs)}</td>
              <td className="px-4 py-3">
                <div className="flex gap-1 flex-wrap">
                  {trace.tags.slice(0, 3).map((tag) => (
                    <span key={tag} className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">{tag}</span>
                  ))}
                </div>
              </td>
              <td className="px-4 py-3 text-right text-gray-500">{formatTime(trace.startedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
