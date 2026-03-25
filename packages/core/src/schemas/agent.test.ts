import { describe, it, expect } from 'vitest';
import { AgentSpecSchema, AgentResourceSchema, AgentStatusSchema } from './agent.js';

describe('AgentSpecSchema', () => {
  it('validates a minimal agent spec', () => {
    const result = AgentSpecSchema.parse({
      identity: {
        name: 'code-agent',
        email: 'code_agent@agents.mycompany.com',
      },
      llm: {
        provider: 'claude',
        model: 'claude-sonnet-4-20250514',
      },
      system: 'You are a coding agent.',
    });

    expect(result.identity.name).toBe('code-agent');
    expect(result.identity.email).toBe('code_agent@agents.mycompany.com');
    expect(result.identity.groups).toEqual([]);
    expect(result.llm.temperature).toBe(0.7);
    expect(result.replicas).toBe(1);
    expect(result.tools).toEqual([]);
    expect(result.permissions.filesystem.read).toEqual([]);
  });

  it('validates a full agent spec', () => {
    const result = AgentSpecSchema.parse({
      identity: {
        name: 'code-agent',
        email: 'code_agent@agents.mycompany.com',
        groups: ['engineering@agents.mycompany.com'],
      },
      llm: {
        provider: 'openai',
        model: 'gpt-4o',
        temperature: 0.3,
        maxTokens: 8192,
      },
      system: 'You are a coding agent.',
      tools: [{ name: 'file-read' }, { name: 'shell-exec', config: { timeout: 30 } }],
      permissions: {
        filesystem: {
          read: ['/workspace/**'],
          write: ['/workspace/src/**'],
        },
        network: {
          allowedHosts: ['github.com'],
        },
      },
      resources: { cpu: '1000m', memory: '1Gi' },
      replicas: 2,
    });

    expect(result.tools).toHaveLength(2);
    expect(result.replicas).toBe(2);
    expect(result.permissions.filesystem.read).toEqual(['/workspace/**']);
  });

  it('rejects invalid email', () => {
    expect(() =>
      AgentSpecSchema.parse({
        identity: { name: 'test', email: 'not-an-email' },
        llm: { provider: 'claude', model: 'test' },
        system: 'test',
      }),
    ).toThrow();
  });

  it('rejects invalid LLM provider', () => {
    expect(() =>
      AgentSpecSchema.parse({
        identity: { name: 'test', email: 'test@example.com' },
        llm: { provider: 'invalid', model: 'test' },
        system: 'test',
      }),
    ).toThrow();
  });
});

describe('AgentStatusSchema', () => {
  it('defaults token fields to 0', () => {
    const result = AgentStatusSchema.parse({ phase: 'Running' });

    expect(result.totalTokensUsed).toBe(0);
    expect(result.promptTokens).toBe(0);
    expect(result.completionTokens).toBe(0);
    expect(result.messagesReceived).toBe(0);
    expect(result.messagesSent).toBe(0);
  });

  it('accepts explicit token values', () => {
    const result = AgentStatusSchema.parse({
      phase: 'Running',
      totalTokensUsed: 5000,
      promptTokens: 3000,
      completionTokens: 2000,
    });

    expect(result.totalTokensUsed).toBe(5000);
    expect(result.promptTokens).toBe(3000);
    expect(result.completionTokens).toBe(2000);
  });
});

describe('AgentResourceSchema', () => {
  it('validates a full Agent CRD resource', () => {
    const result = AgentResourceSchema.parse({
      apiVersion: 'agents.kube-agents.io/v1alpha1',
      kind: 'Agent',
      metadata: {
        name: 'code-agent',
        namespace: 'default',
      },
      spec: {
        identity: {
          name: 'code-agent',
          email: 'code_agent@agents.mycompany.com',
        },
        llm: { provider: 'claude', model: 'claude-sonnet-4-20250514' },
        system: 'You are a coding agent.',
      },
    });

    expect(result.apiVersion).toBe('agents.kube-agents.io/v1alpha1');
    expect(result.kind).toBe('Agent');
  });
});
