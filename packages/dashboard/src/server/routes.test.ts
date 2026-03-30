import { describe, it, expect, vi } from 'vitest';

vi.mock('./db.js', () => ({
  listProjects: vi.fn().mockResolvedValue([]),
  getProjectByName: vi.fn().mockResolvedValue(null),
  getProjectStats: vi.fn().mockResolvedValue([]),
  listTraces: vi.fn().mockResolvedValue({ traces: [], total: 0, hasMore: false }),
  getTrace: vi.fn().mockResolvedValue(null),
  listRunsForTrace: vi.fn().mockResolvedValue([]),
  getRun: vi.fn().mockResolvedValue(null),
  insertFeedback: vi.fn().mockResolvedValue(undefined),
  listFeedbackForTrace: vi.fn().mockResolvedValue([]),
  listFeedbackForRun: vi.fn().mockResolvedValue([]),
  deleteFeedback: vi.fn().mockResolvedValue(false),
  insertDataset: vi.fn().mockResolvedValue(undefined),
  updateDataset: vi.fn().mockResolvedValue(false),
  getDataset: vi.fn().mockResolvedValue(null),
  listDatasets: vi.fn().mockResolvedValue([]),
  deleteDataset: vi.fn().mockResolvedValue(false),
  insertExample: vi.fn().mockResolvedValue(undefined),
  listExamples: vi.fn().mockResolvedValue([]),
  getExample: vi.fn().mockResolvedValue(null),
  updateExample: vi.fn().mockResolvedValue(false),
  deleteExample: vi.fn().mockResolvedValue(false),
  listExperiments: vi.fn().mockResolvedValue([]),
  getExperiment: vi.fn().mockResolvedValue(null),
  deleteExperiment: vi.fn().mockResolvedValue(false),
  listExperimentResults: vi.fn().mockResolvedValue([]),
  getTimeSeries: vi.fn().mockResolvedValue([]),
  getModelUsage: vi.fn().mockResolvedValue([]),
  getErrorRates: vi.fn().mockResolvedValue([]),
}));

vi.mock('./nats-client.js', () => ({
  isNatsAvailable: vi.fn().mockReturnValue(false),
  getAgentMessages: vi.fn().mockResolvedValue({ messages: [], hasMore: false }),
  getThreadMessages: vi.fn().mockResolvedValue([]),
  initNats: vi.fn().mockResolvedValue(undefined),
  initTraceConsumer: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./k8s-client.js', () => ({
  listAgents: vi.fn().mockResolvedValue([
    {
      metadata: { name: 'test-agent', namespace: 'default', creationTimestamp: '2026-01-01T00:00:00Z' },
      spec: {
        identity: { name: 'test-agent', email: 'test@agents.example.com' },
        llm: { provider: 'claude', model: 'claude-sonnet-4-20250514' },
        replicas: 1,
      },
      status: {
        phase: 'Running',
        readyReplicas: 1,
        messagesReceived: 10,
        messagesSent: 5,
        totalTokensUsed: 1500,
        promptTokens: 1000,
        completionTokens: 500,
      },
    },
  ]),
  listAgentGroups: vi.fn().mockResolvedValue([
    {
      metadata: { name: 'test-group', namespace: 'default', creationTimestamp: '2026-01-01T00:00:00Z' },
      spec: {
        email: 'team@agents.example.com',
        members: ['test@agents.example.com'],
      },
      status: { memberCount: 1, readyMembers: 1 },
    },
  ]),
}));

import { api } from './routes.js';

describe('API routes', () => {
  it('GET /agents returns agent list', async () => {
    const res = await api.request('/agents');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].metadata.name).toBe('test-agent');
  });

  it('GET /agentgroups returns group list', async () => {
    const res = await api.request('/agentgroups');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].spec.email).toBe('team@agents.example.com');
  });

  it('GET /overview returns combined data', async () => {
    const res = await api.request('/overview');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.agents).toHaveLength(1);
    expect(body.groups).toHaveLength(1);
  });
});
