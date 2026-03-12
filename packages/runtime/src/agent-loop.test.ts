import { describe, it, expect, vi } from 'vitest';
import { handleEmail } from './agent-loop.js';
import type { AgentLoopDeps } from './agent-loop.js';
import type { Email, AgentSpec, LLMResponse } from '@kube-agents/core';
import { ToolRegistry } from '@kube-agents/tools';

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

describe('handleEmail', () => {
  it('sends a reply when LLM returns a text response', async () => {
    const mockReply = vi.fn();
    const mockLLM = {
      name: 'test',
      complete: vi.fn().mockResolvedValue({
        content: 'Here is my response.',
        toolCalls: [],
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        finishReason: 'stop',
      } satisfies LLMResponse),
    };

    const deps: AgentLoopDeps = {
      spec: testSpec,
      mailbox: { reply: mockReply } as unknown as AgentLoopDeps['mailbox'],
      llm: mockLLM,
      toolRegistry: new ToolRegistry(),
    };

    await handleEmail(deps, testEmail);

    expect(mockLLM.complete).toHaveBeenCalledOnce();
    expect(mockReply).toHaveBeenCalledWith(testEmail, 'Here is my response.');
  });

  it('executes tool calls and continues the loop', async () => {
    const mockReply = vi.fn();
    const toolRegistry = new ToolRegistry();
    toolRegistry.register({
      definition: {
        name: 'echo',
        description: 'Echo tool',
        parameters: { message: { type: 'string', description: 'msg', required: true } },
      },
      execute: async (args) => `Echo: ${args['message'] as string}`,
    });

    const mockLLM = {
      name: 'test',
      complete: vi
        .fn()
        .mockResolvedValueOnce({
          content: '',
          toolCalls: [
            { id: 'tc1', name: 'echo', arguments: '{"message":"hi"}' },
          ],
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
          finishReason: 'tool_calls',
        } satisfies LLMResponse)
        .mockResolvedValueOnce({
          content: 'Done with tools.',
          toolCalls: [],
          usage: { promptTokens: 30, completionTokens: 10, totalTokens: 40 },
          finishReason: 'stop',
        } satisfies LLMResponse),
    };

    const deps: AgentLoopDeps = {
      spec: testSpec,
      mailbox: { reply: mockReply } as unknown as AgentLoopDeps['mailbox'],
      llm: mockLLM,
      toolRegistry,
    };

    await handleEmail(deps, testEmail);

    expect(mockLLM.complete).toHaveBeenCalledTimes(2);
    expect(mockReply).toHaveBeenCalledWith(testEmail, 'Done with tools.');
  });
});
