interface HeaderProps {
  lastUpdated: Date | null;
  onRefresh: () => void;
}

export function Header({ lastUpdated, onRefresh }: HeaderProps) {
  return (
    <header className="flex items-center justify-between mb-8">
      <div>
        <h1 className="text-2xl font-bold text-white">kube-agents Dashboard</h1>
        <p className="text-gray-400 text-sm mt-1">Agent status overview</p>
      </div>
      <div className="flex items-center gap-4">
        {lastUpdated && (
          <span className="text-gray-500 text-xs">
            Updated {lastUpdated.toLocaleTimeString()}
          </span>
        )}
        <button
          onClick={onRefresh}
          className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-sm border border-gray-700 transition-colors"
        >
          Refresh
        </button>
      </div>
    </header>
  );
}
