import { useState } from 'react';
import { useDatasets } from '../hooks/use-datasets.js';
import type { DatasetData } from '../types.js';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function DatasetsPage() {
  const { datasets, loading, error, refresh } = useDatasets();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await fetch('/api/datasets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || undefined }),
      });
      setNewName('');
      setNewDesc('');
      setShowCreate(false);
      refresh();
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/datasets/${id}`, { method: 'DELETE' });
    refresh();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Datasets</h1>
        <div className="flex gap-2">
          <button
            onClick={refresh}
            className="px-3 py-1.5 bg-gray-700 text-gray-300 rounded text-sm hover:bg-gray-600"
          >
            Refresh
          </button>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-500"
          >
            New Dataset
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded text-red-300 text-sm">
          {error}
        </div>
      )}

      {showCreate && (
        <div className="mb-6 p-4 bg-gray-800 rounded-lg border border-gray-700">
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Dataset name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-white text-sm"
            />
            <textarea
              placeholder="Description (optional)"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-white text-sm"
              rows={2}
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                className="px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-500 disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-3 py-1.5 bg-gray-700 text-gray-300 rounded text-sm hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-gray-400 text-center py-12">Loading datasets...</div>
      ) : datasets.length === 0 ? (
        <div className="text-gray-500 text-center py-12">
          No datasets yet. Create one to get started with evaluation.
        </div>
      ) : (
        <div className="space-y-3">
          {datasets.map((ds) => (
            <DatasetRow key={ds.id} dataset={ds} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

function DatasetRow({ dataset, onDelete }: { dataset: DatasetData; onDelete: (id: string) => void }) {
  return (
    <div className="bg-gray-800/60 rounded-lg border border-gray-700 p-4 hover:border-gray-600 transition-colors">
      <div className="flex items-center justify-between">
        <a
          href={`#datasets/${dataset.id}`}
          className="text-blue-400 hover:text-blue-300 font-medium"
        >
          {dataset.name}
        </a>
        <div className="flex items-center gap-3 text-sm text-gray-400">
          <span>{formatDate(dataset.updatedAt)}</span>
          <button
            onClick={() => onDelete(dataset.id)}
            className="text-red-400 hover:text-red-300"
          >
            Delete
          </button>
        </div>
      </div>
      {dataset.description && (
        <p className="text-gray-400 text-sm mt-1">{dataset.description}</p>
      )}
    </div>
  );
}
