import { useExperiments } from '../hooks/use-experiments.js';
import type { ExperimentData } from '../types.js';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function ExperimentsPage() {
  const { experiments, loading, error, refresh } = useExperiments();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Experiments</h1>
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
        <div className="text-gray-400 text-center py-12">Loading experiments...</div>
      ) : experiments.length === 0 ? (
        <div className="text-gray-500 text-center py-12">
          No experiments yet. Run one from a dataset to get started.
        </div>
      ) : (
        <div className="space-y-3">
          {experiments.map((exp) => (
            <ExperimentRow key={exp.id} experiment={exp} />
          ))}
        </div>
      )}
    </div>
  );
}

function ExperimentRow({ experiment }: { experiment: ExperimentData }) {
  const statusColors: Record<string, string> = {
    running: 'bg-yellow-900/50 text-yellow-300',
    completed: 'bg-green-900/50 text-green-300',
    error: 'bg-red-900/50 text-red-300',
  };

  return (
    <a
      href={`#experiments/${experiment.id}`}
      className="block bg-gray-800/60 rounded-lg border border-gray-700 p-4 hover:border-gray-600 transition-colors"
    >
      <div className="flex items-center justify-between">
        <div>
          <span className="text-blue-400 font-medium">{experiment.name}</span>
          {experiment.description && (
            <p className="text-gray-400 text-sm mt-0.5">{experiment.description}</p>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className={`px-2 py-0.5 rounded text-xs ${statusColors[experiment.status] ?? 'bg-gray-700 text-gray-300'}`}>
            {experiment.status}
          </span>
          <span className="text-gray-500">{formatDate(experiment.createdAt)}</span>
        </div>
      </div>
    </a>
  );
}
