import { describe, it, expect, vi } from 'vitest';

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
