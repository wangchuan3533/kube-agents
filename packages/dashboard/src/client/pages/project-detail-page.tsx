import { useState, useEffect, useCallback } from 'react';
import { TraceRunTable } from '../components/trace-run-table.js';
import type { ProjectData, TraceData } from '../types.js';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function ProjectDetailPage({ projectName }: { projectName: string }) {
  const [project, setProject] = useState<ProjectData | null>(null);
  const [traces, setTraces] = useState<TraceData[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/projects/${projectName}`).then((r) => {
        if (!r.ok) throw new Error('Project not found');
        return r.json();
      }),
      fetch(`/api/projects/${projectName}/traces?limit=100`).then((r) => r.json()),
    ])
      .then(([proj, traceRes]) => {
        setProject(proj as ProjectData);
        const tr = traceRes as { traces: TraceData[]; total: number };
        setTraces(tr.traces);
        setTotal(tr.total);
        setLoading(false);
        setError(null);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [projectName]);

  useEffect(() => { refresh(); }, [refresh]);

  if (loading) return <div className="text-gray-400 text-center py-12">Loading...</div>;
  if (error) return <div className="text-red-400 text-center py-12">{error}</div>;
  if (!project) return <div className="text-gray-400 text-center py-12">Project not found</div>;

  const totalTokens = traces.reduce((s, t) => s + t.totalTokens, 0);
  const errorCount = traces.filter((t) => t.status === 'error').length;

  return (
    <div>
      <div className="mb-6">
        <a href="#projects" className="text-gray-400 hover:text-gray-300 text-sm">
          &larr; Projects
        </a>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{project.name}</h1>
          {project.description && (
            <p className="text-gray-400 mt-1">{project.description}</p>
          )}
        </div>
        <button
          onClick={refresh}
          className="px-3 py-1.5 bg-gray-700 text-gray-300 rounded text-sm hover:bg-gray-600"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <MetricBox label="Total Traces" value={String(total)} />
        <MetricBox label="Tokens" value={formatTokens(totalTokens)} color="text-blue-400" />
        <MetricBox label="Errors" value={String(errorCount)} color={errorCount > 0 ? 'text-red-400' : 'text-white'} />
        <MetricBox
          label="Error Rate"
          value={total > 0 ? `${(errorCount / total * 100).toFixed(1)}%` : '0%'}
          color={total > 0 && errorCount / total > 0.1 ? 'text-red-400' : 'text-green-400'}
        />
      </div>

      <h2 className="text-lg font-semibold text-white mb-3">Traces</h2>
      <TraceRunTable traces={traces} loading={false} />
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
