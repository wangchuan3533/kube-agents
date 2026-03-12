import { describe, it, expect } from 'vitest';
import { buildContext } from './context-builder.js';
import type { AgentSpec, Email } from '@kube-agents/core';

const testSpec: AgentSpec = {
  identity: {
    name: 'test-agent',
    email: 'test@agents.mycompany.com',
    groups: [],
  },
  llm: { provider: 'claude', model: 'test', temperature: 0.7, maxTokens: 4096 },
  system: 'You are a test agent.',
  tools: [],
  skills: [],
  permissions: {
    filesystem: { read: [], write: [] },
    network: { allowedHosts: [], deniedHosts: [] },
    tools: [],
    maxConcurrentToolCalls: 5,
  },
  resources: { cpu: '500m', memory: '512Mi' },
  replicas: 1,
};

const testEmail: Email = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  from: 'sender@agents.mycompany.com',
  to: ['test@agents.mycompany.com'],
  subject: 'Hello',
  body: 'Please help me.',
  attachments: [],
  timestamp: new Date(),
};

describe('buildContext', () => {
  it('builds context with system prompt and current email', () => {
    const messages = buildContext(testSpec, testEmail, []);

    expect(messages).toHaveLength(2);
    expect(messages[0]!.role).toBe('system');
    expect(messages[0]!.content).toBe('You are a test agent.');
    expect(messages[1]!.role).toBe('user');
    expect(messages[1]!.content).toContain('sender@agents.mycompany.com');
    expect(messages[1]!.content).toContain('Please help me.');
  });

  it('includes thread history', () => {
    const historyEmail: Email = {
      ...testEmail,
      id: '550e8400-e29b-41d4-a716-446655440001',
      from: 'test@agents.mycompany.com',
      to: ['sender@agents.mycompany.com'],
      body: 'Previous response',
    };

    const messages = buildContext(testSpec, testEmail, [historyEmail]);

    expect(messages).toHaveLength(3);
    expect(messages[1]!.role).toBe('assistant'); // from self
    expect(messages[2]!.role).toBe('user');
  });

  it('does not duplicate email if already in history', () => {
    const messages = buildContext(testSpec, testEmail, [testEmail]);

    expect(messages).toHaveLength(2); // system + one email (not duplicated)
  });
});
