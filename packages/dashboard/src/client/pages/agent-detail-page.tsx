import { useState } from 'react';
import { useAgentDetail } from '../hooks/use-agent-detail.js';
import { useAgentMessages } from '../hooks/use-agent-messages.js';
import { useTraces } from '../hooks/use-traces.js';
import { StatusBadge } from '../components/status-badge.js';
import { MetricCard } from '../components/metric-card.js';
import { MessageList } from '../components/message-list.js';
import { AgentConfig } from '../components/agent-config.js';
import { TraceRunTable } from '../components/trace-run-table.js';

type Tab = 'overview' | 'messages' | 'traces' | 'configuration';

interface AgentDetailPageProps {
  namespace: string;
  name: string;
}

function formatNumber(n: number | undefined): string {
  if (n === undefined || n === 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatTime(iso: string | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'messages', label: 'Messages' },
  { key: 'traces', label: 'Traces' },
  { key: 'configuration', label: 'Configuration' },
];

export function AgentDetailPage({ namespace, name }: AgentDetailPageProps) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const { agent, error, loading } = useAgentDetail(namespace, name);
  const msgState = useAgentMessages(namespace, name);
  const traceState = useTraces({ agentName: name });

  if (loading && !agent) {
    return (
      <div className="text-gray-500 text-sm py-12 text-center">Loading agent...</div>
    );
  }

  if (error || !agent) {
    return (
      <div>
        <a href="#/" className="text-blue-400 hover:text-blue-300 text-sm mb-4 inline-block">
          ← All Agents
        </a>
        <div className="p-4 bg-red-900/30 border border-red-800 rounded text-red-300 text-sm">
          {error ?? 'Agent not found'}
        </div>
      </div>
    );
  }

  const status = agent.status;

  return (
    <div>
      {/* Header */}
      <a href="#/" className="text-blue-400 hover:text-blue-300 text-sm mb-4 inline-block">
        ← All Agents
      </a>

      <div className="flex items-center gap-4 mb-2">
        <h1 className="text-2xl font-bold text-white">{agent.metadata.name}</h1>
        <StatusBadge phase={status?.phase} />
      </div>
      <p className="text-gray-400 text-sm mb-6">{agent.spec.identity.email}</p>

      {/* Tab Bar */}
      <div className="flex gap-1 mb-6 border-b border-gray-800">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div>
          {/* Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <MetricCard label="Replicas" value={`${status?.readyReplicas ?? 0}/${agent.spec.replicas}`} />
            <MetricCard label="Msgs Received" value={formatNumber(status?.messagesReceived)} color="text-blue-400" />
            <MetricCard label="Msgs Sent" value={formatNumber(status?.messagesSent)} color="text-blue-400" />
            <MetricCard label="Total Tokens" value={formatNumber(status?.totalTokensUsed)} color="text-purple-400" />
          </div>

          {/* Identity */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">Identity</h3>
            <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-500 mb-1">Name</div>
                  <div className="text-sm text-white">{agent.spec.identity.name}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">Email</div>
                  <div className="text-sm text-white font-mono">{agent.spec.identity.email}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">Groups</div>
                  <div className="flex flex-wrap gap-1">
                    {agent.spec.identity.groups && agent.spec.identity.groups.length > 0 ? (
                      agent.spec.identity.groups.map((g) => (
                        <span key={g} className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded font-mono">
                          {g}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-gray-600">none</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">Last Active</div>
                  <div className="text-sm text-white">{formatTime(status?.lastActiveAt)}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Token Breakdown */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">Token Usage</h3>
            <div className="grid grid-cols-3 gap-4">
              <MetricCard label="Prompt Tokens" value={formatNumber(status?.promptTokens)} />
              <MetricCard label="Completion Tokens" value={formatNumber(status?.completionTokens)} />
              <MetricCard label="Total Tokens" value={formatNumber(status?.totalTokensUsed)} color="text-purple-400" />
            </div>
          </div>

          {/* LLM Config Summary */}
          <div>
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">LLM</h3>
            <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-xs text-gray-500 mb-1">Provider</div>
                  <div className="text-sm text-white">{agent.spec.llm.provider}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">Model</div>
                  <div className="text-sm text-white font-mono">{agent.spec.llm.model}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">Temperature</div>
                  <div className="text-sm text-white">{agent.spec.llm.temperature ?? '0.7'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">Max Tokens</div>
                  <div className="text-sm text-white">{agent.spec.llm.maxTokens ?? '4096'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'messages' && (
        <MessageList
          messages={msgState.messages}
          loading={msgState.loading}
          error={msgState.error}
          hasMore={msgState.hasMore}
          onLoadMore={msgState.loadMore}
          onRefresh={msgState.refresh}
        />
      )}

      {activeTab === 'traces' && (
        <TraceRunTable runs={traceState.runs} loading={traceState.loading} />
      )}

      {activeTab === 'configuration' && (
        <AgentConfig agent={agent} />
      )}
    </div>
  );
}
