import { describe, it, expect } from 'vitest';
import { ToolRegistry } from './tool-registry.js';
import type { RegisteredTool } from './tool-registry.js';

const echoTool: RegisteredTool = {
  definition: {
    name: 'echo',
    description: 'Echo back the input',
    parameters: {
      message: { type: 'string', description: 'Message to echo', required: true },
    },
  },
  execute: async (args) => `Echo: ${args['message'] as string}`,
};

const failTool: RegisteredTool = {
  definition: {
    name: 'fail',
    description: 'Always fails',
    parameters: {},
  },
  execute: async () => {
    throw new Error('Intentional failure');
  },
};

describe('ToolRegistry', () => {
  it('registers and retrieves tools', () => {
    const registry = new ToolRegistry();
    registry.register(echoTool);

    expect(registry.has('echo')).toBe(true);
    expect(registry.has('nonexistent')).toBe(false);
    expect(registry.get('echo')?.definition.name).toBe('echo');
  });

  it('lists all tool definitions', () => {
    const registry = new ToolRegistry();
    registry.register(echoTool);
    registry.register(failTool);

    const definitions = registry.list();
    expect(definitions).toHaveLength(2);
    expect(definitions.map((d) => d.name)).toEqual(['echo', 'fail']);
  });

  it('filters tools by permissions', () => {
    const registry = new ToolRegistry();
    registry.register(echoTool);
    registry.register(failTool);

    const allowed = registry.listAllowed({
      filesystem: { read: [], write: [] },
      network: { allowedHosts: [], deniedHosts: [] },
      tools: ['echo'],
      maxConcurrentToolCalls: 5,
    });

    expect(allowed).toHaveLength(1);
    expect(allowed[0]!.name).toBe('echo');
  });

  it('returns all tools when permission tools list is empty', () => {
    const registry = new ToolRegistry();
    registry.register(echoTool);
    registry.register(failTool);

    const allowed = registry.listAllowed({
      filesystem: { read: [], write: [] },
      network: { allowedHosts: [], deniedHosts: [] },
      tools: [],
      maxConcurrentToolCalls: 5,
    });

    expect(allowed).toHaveLength(2);
  });

  it('executes a tool successfully', async () => {
    const registry = new ToolRegistry();
    registry.register(echoTool);

    const result = await registry.execute('echo', { message: 'hello' }, 'call-1');
    expect(result.result).toBe('Echo: hello');
    expect(result.isError).toBe(false);
  });

  it('returns error result for unknown tool', async () => {
    const registry = new ToolRegistry();

    const result = await registry.execute('unknown', {}, 'call-1');
    expect(result.isError).toBe(true);
    expect(result.result).toContain('not found');
  });

  it('returns error result when tool throws', async () => {
    const registry = new ToolRegistry();
    registry.register(failTool);

    const result = await registry.execute('fail', {}, 'call-1');
    expect(result.isError).toBe(true);
    expect(result.result).toContain('Intentional failure');
  });
});
