import { useAgentData } from './hooks/use-agent-data.js';
import { Header } from './components/header.js';
import { MetricCard } from './components/metric-card.js';
import { AgentTable } from './components/agent-table.js';
import { AgentGroupTable } from './components/agent-group-table.js';

export function App() {
  const { data, error, lastUpdated, refresh } = useAgentData();

  const agents = data?.agents ?? [];
  const groups = data?.groups ?? [];

  const totalAgents = agents.length;
  const running = agents.filter((a) => a.status?.phase === 'Running').length;
  const errors = agents.filter((a) => a.status?.phase === 'Error').length;
  const totalTokens = agents.reduce((sum, a) => sum + (a.status?.totalTokensUsed ?? 0), 0);

  const formatTokens = (n: number): string => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <Header lastUpdated={lastUpdated} onRefresh={refresh} />

      {error && (
        <div className="mb-6 p-3 bg-red-900/30 border border-red-800 rounded text-red-300 text-sm">
          Error fetching data: {error}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <MetricCard label="Total Agents" value={totalAgents} />
        <MetricCard label="Running" value={running} color="text-green-400" />
        <MetricCard label="Errors" value={errors} color={errors > 0 ? 'text-red-400' : 'text-white'} />
        <MetricCard label="Total Tokens" value={formatTokens(totalTokens)} color="text-blue-400" />
      </div>

      <AgentTable agents={agents} />
      <AgentGroupTable groups={groups} />
    </div>
  );
}
