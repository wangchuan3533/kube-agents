const PHASE_COLORS: Record<string, string> = {
  Running: 'bg-green-900 text-green-300 border-green-700',
  Pending: 'bg-yellow-900 text-yellow-300 border-yellow-700',
  Error: 'bg-red-900 text-red-300 border-red-700',
  Terminated: 'bg-gray-800 text-gray-400 border-gray-600',
};

interface StatusBadgeProps {
  phase: string | undefined;
}

export function StatusBadge({ phase }: StatusBadgeProps) {
  const display = phase ?? 'Unknown';
  const classes = PHASE_COLORS[display] ?? 'bg-gray-800 text-gray-400 border-gray-600';

  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${classes}`}>
      {display}
    </span>
  );
}
