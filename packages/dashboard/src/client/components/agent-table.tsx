import type { AgentData } from '../types.js';
import { StatusBadge } from './status-badge.js';

function formatNumber(n: number | undefined): string {
  if (n === undefined || n === 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatTime(iso: string | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString();
}

interface AgentTableProps {
  agents: AgentData[];
}

export function AgentTable({ agents }: AgentTableProps) {
  return (
    <div className="mb-8">
      <h2 className="text-lg font-semibold text-white mb-3">Agents</h2>
      <div className="overflow-x-auto rounded-lg border border-gray-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-900 text-gray-400 text-left text-xs uppercase tracking-wide">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Model</th>
              <th className="px-4 py-3">Phase</th>
              <th className="px-4 py-3 text-right">Replicas</th>
              <th className="px-4 py-3 text-right">Msgs In</th>
              <th className="px-4 py-3 text-right">Msgs Out</th>
              <th className="px-4 py-3 text-right">Tokens</th>
              <th className="px-4 py-3">Last Active</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {agents.map((agent) => (
              <tr key={agent.metadata.name} className="hover:bg-gray-900/50">
                <td className="px-4 py-3 font-medium">
                  <a
                    href={`#/agents/${agent.metadata.namespace}/${agent.metadata.name}`}
                    className="text-blue-400 hover:text-blue-300"
                  >
                    {agent.metadata.name}
                  </a>
                </td>
                <td className="px-4 py-3 text-gray-300">{agent.spec.identity.email}</td>
                <td className="px-4 py-3 text-gray-300">
                  <span className="text-gray-500">{agent.spec.llm.provider}/</span>
                  {agent.spec.llm.model}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge phase={agent.status?.phase} />
                </td>
                <td className="px-4 py-3 text-right text-gray-300">
                  {agent.status?.readyReplicas ?? 0}/{agent.spec.replicas ?? 1}
                </td>
                <td className="px-4 py-3 text-right text-gray-300">
                  {formatNumber(agent.status?.messagesReceived)}
                </td>
                <td className="px-4 py-3 text-right text-gray-300">
                  {formatNumber(agent.status?.messagesSent)}
                </td>
                <td className="px-4 py-3 text-right text-gray-300">
                  {formatNumber(agent.status?.totalTokensUsed)}
                </td>
                <td className="px-4 py-3 text-gray-400">
                  {formatTime(agent.status?.lastActiveAt)}
                </td>
              </tr>
            ))}
            {agents.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                  No agents found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
