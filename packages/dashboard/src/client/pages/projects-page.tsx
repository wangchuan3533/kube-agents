import { useState, useEffect, useCallback } from 'react';
import type { ProjectData, ProjectStats } from '../types.js';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString();
}

interface ProjectsData {
  projects: ProjectData[];
  stats: ProjectStats[];
}

export function ProjectsPage() {
  const [data, setData] = useState<ProjectsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    fetch('/api/projects')
      .then((r) => r.json())
      .then((d: ProjectsData) => {
        setData(d);
        setLoading(false);
        setError(null);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const statsMap = new Map(
    (data?.stats ?? []).map((s) => [s.projectId, s]),
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Projects</h1>
          <p className="text-gray-400 text-sm mt-1">Agent trace groupings with aggregate metrics</p>
        </div>
        <button
          onClick={refresh}
          className="px-3 py-1.5 bg-gray-700 text-gray-300 rounded text-sm hover:bg-gray-600"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded text-red-300 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-gray-400 text-center py-12">Loading projects...</div>
      ) : !data || data.projects.length === 0 ? (
        <div className="text-gray-500 text-center py-12">
          No projects yet. Projects are created automatically when agents emit traces.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-900 text-gray-400 text-left text-xs uppercase tracking-wide">
                <th className="px-4 py-3">Project</th>
                <th className="px-4 py-3 text-right">Traces</th>
                <th className="px-4 py-3 text-right">Runs</th>
                <th className="px-4 py-3 text-right">Tokens</th>
                <th className="px-4 py-3 text-right">Avg Latency</th>
                <th className="px-4 py-3 text-right">Errors</th>
                <th className="px-4 py-3 text-right">Error Rate</th>
                <th className="px-4 py-3">Last Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {data.projects.map((project) => {
                const stats = statsMap.get(project.id);
                const errorRate = stats && stats.traceCount > 0
                  ? (stats.errorCount / stats.traceCount * 100).toFixed(1)
                  : '0.0';
                return (
                  <tr key={project.id} className="hover:bg-gray-900/50">
                    <td className="px-4 py-3">
                      <a
                        href={`#projects/${project.name}`}
                        className="text-blue-400 hover:text-blue-300 font-medium"
                      >
                        {project.name}
                      </a>
                      {project.description && (
                        <div className="text-gray-500 text-xs mt-0.5">{project.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-300">
                      {stats?.traceCount ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-300">
                      {stats?.runCount ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right text-blue-400">
                      {formatTokens(stats?.totalTokens ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400">
                      {stats?.avgLatencyMs != null ? `${stats.avgLatencyMs.toFixed(0)}ms` : '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={(stats?.errorCount ?? 0) > 0 ? 'text-red-400' : 'text-gray-400'}>
                        {stats?.errorCount ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={Number(errorRate) > 10 ? 'text-red-400' : 'text-green-400'}>
                        {errorRate}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {formatDate(stats?.lastTraceAt ?? null)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
