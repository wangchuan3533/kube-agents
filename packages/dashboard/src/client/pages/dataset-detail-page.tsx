import { useState } from 'react';
import { useDatasetDetail } from '../hooks/use-datasets.js';
import { useExperiments } from '../hooks/use-experiments.js';
import type { ExampleData } from '../types.js';

export function DatasetDetailPage({ datasetId }: { datasetId: string }) {
  const { dataset, examples, loading, error, refresh } = useDatasetDetail(datasetId);
  const { experiments } = useExperiments(datasetId);
  const [showAddExample, setShowAddExample] = useState(false);
  const [inputsText, setInputsText] = useState('{}');
  const [expectedText, setExpectedText] = useState('{}');
  const [adding, setAdding] = useState(false);
  const [showRunExperiment, setShowRunExperiment] = useState(false);
  const [experimentName, setExperimentName] = useState('');
  const [running, setRunning] = useState(false);

  const handleAddExample = async () => {
    setAdding(true);
    try {
      const inputs = JSON.parse(inputsText);
      const expectedOutputs = expectedText.trim() ? JSON.parse(expectedText) : undefined;
      await fetch(`/api/datasets/${datasetId}/examples`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs, expectedOutputs }),
      });
      setInputsText('{}');
      setExpectedText('{}');
      setShowAddExample(false);
      refresh();
    } catch (err) {
      alert(`Invalid JSON: ${err instanceof Error ? err.message : err}`);
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteExample = async (id: string) => {
    await fetch(`/api/examples/${id}`, { method: 'DELETE' });
    refresh();
  };

  const handleRunExperiment = async () => {
    if (!experimentName.trim()) return;
    setRunning(true);
    try {
      const res = await fetch('/api/experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: experimentName.trim(), datasetId }),
      });
      if (res.ok) {
        const data = await res.json();
        window.location.hash = `experiments/${data.experiment.id}`;
      }
    } finally {
      setRunning(false);
    }
  };

  if (loading) return <div className="text-gray-400 text-center py-12">Loading...</div>;
  if (error) return <div className="text-red-400 text-center py-12">{error}</div>;
  if (!dataset) return <div className="text-gray-400 text-center py-12">Dataset not found</div>;

  return (
    <div>
      <div className="mb-6">
        <a href="#datasets" className="text-gray-400 hover:text-gray-300 text-sm">
          &larr; Datasets
        </a>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{dataset.name}</h1>
          {dataset.description && (
            <p className="text-gray-400 mt-1">{dataset.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddExample(!showAddExample)}
            className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-500"
          >
            Add Example
          </button>
          <button
            onClick={() => setShowRunExperiment(!showRunExperiment)}
            className="px-3 py-1.5 bg-purple-600 text-white rounded text-sm hover:bg-purple-500"
          >
            Run Experiment
          </button>
        </div>
      </div>

      {showRunExperiment && (
        <div className="mb-6 p-4 bg-gray-800 rounded-lg border border-gray-700">
          <h3 className="text-white font-medium mb-3">Run Experiment</h3>
          <input
            type="text"
            placeholder="Experiment name"
            value={experimentName}
            onChange={(e) => setExperimentName(e.target.value)}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-white text-sm mb-3"
          />
          <div className="flex gap-2">
            <button
              onClick={handleRunExperiment}
              disabled={running || !experimentName.trim()}
              className="px-3 py-1.5 bg-purple-600 text-white rounded text-sm hover:bg-purple-500 disabled:opacity-50"
            >
              {running ? 'Running...' : 'Run'}
            </button>
            <button
              onClick={() => setShowRunExperiment(false)}
              className="px-3 py-1.5 bg-gray-700 text-gray-300 rounded text-sm hover:bg-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showAddExample && (
        <div className="mb-6 p-4 bg-gray-800 rounded-lg border border-gray-700">
          <h3 className="text-white font-medium mb-3">Add Example</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-gray-400 text-xs mb-1">Inputs (JSON)</label>
              <textarea
                value={inputsText}
                onChange={(e) => setInputsText(e.target.value)}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-white text-sm font-mono"
                rows={4}
              />
            </div>
            <div>
              <label className="block text-gray-400 text-xs mb-1">Expected Outputs (JSON, optional)</label>
              <textarea
                value={expectedText}
                onChange={(e) => setExpectedText(e.target.value)}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-white text-sm font-mono"
                rows={4}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAddExample}
                disabled={adding}
                className="px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-500 disabled:opacity-50"
              >
                {adding ? 'Adding...' : 'Add'}
              </button>
              <button
                onClick={() => setShowAddExample(false)}
                className="px-3 py-1.5 bg-gray-700 text-gray-300 rounded text-sm hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Experiments for this dataset */}
      {experiments.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-3">Experiments</h2>
          <div className="space-y-2">
            {experiments.map((exp) => (
              <a
                key={exp.id}
                href={`#experiments/${exp.id}`}
                className="block p-3 bg-gray-800/60 rounded border border-gray-700 hover:border-gray-600"
              >
                <div className="flex items-center justify-between">
                  <span className="text-blue-400">{exp.name}</span>
                  <div className="flex items-center gap-3 text-sm">
                    <StatusBadge status={exp.status} />
                    <span className="text-gray-500">
                      {new Date(exp.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Examples */}
      <h2 className="text-lg font-semibold text-white mb-3">
        Examples ({examples.length})
      </h2>

      {examples.length === 0 ? (
        <div className="text-gray-500 text-center py-8">
          No examples yet. Add some to build your evaluation dataset.
        </div>
      ) : (
        <div className="space-y-3">
          {examples.map((ex) => (
            <ExampleRow key={ex.id} example={ex} onDelete={handleDeleteExample} />
          ))}
        </div>
      )}
    </div>
  );
}

function ExampleRow({ example, onDelete }: { example: ExampleData; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-gray-800/60 rounded-lg border border-gray-700 p-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-gray-300 hover:text-white text-sm font-mono"
        >
          {expanded ? '\u25BC' : '\u25B6'} {example.id.slice(0, 8)}...
          {example.split && (
            <span className="ml-2 px-1.5 py-0.5 bg-gray-700 rounded text-xs text-gray-400">
              {example.split}
            </span>
          )}
        </button>
        <button
          onClick={() => onDelete(example.id)}
          className="text-red-400 hover:text-red-300 text-sm"
        >
          Delete
        </button>
      </div>
      {expanded && (
        <div className="mt-3 space-y-2">
          <div>
            <div className="text-gray-500 text-xs mb-1">Inputs</div>
            <pre className="bg-gray-900 rounded p-2 text-xs text-gray-300 overflow-x-auto">
              {JSON.stringify(example.inputs, null, 2)}
            </pre>
          </div>
          {example.expectedOutputs && (
            <div>
              <div className="text-gray-500 text-xs mb-1">Expected Outputs</div>
              <pre className="bg-gray-900 rounded p-2 text-xs text-gray-300 overflow-x-auto">
                {JSON.stringify(example.expectedOutputs, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    running: 'bg-yellow-900/50 text-yellow-300',
    completed: 'bg-green-900/50 text-green-300',
    error: 'bg-red-900/50 text-red-300',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs ${colors[status] ?? 'bg-gray-700 text-gray-300'}`}>
      {status}
    </span>
  );
}
