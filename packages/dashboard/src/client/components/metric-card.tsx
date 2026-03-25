interface MetricCardProps {
  label: string;
  value: string | number;
  color?: string;
}

export function MetricCard({ label, value, color = 'text-white' }: MetricCardProps) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-semibold ${color}`}>{value}</p>
    </div>
  );
}
