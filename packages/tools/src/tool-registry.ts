import type { ToolDefinition, ToolResult, Permissions } from '@kube-agents/core';

export type ToolExecutor = (args: Record<string, unknown>) => Promise<string>;

export interface RegisteredTool {
  definition: ToolDefinition;
  execute: ToolExecutor;
}

export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();

  register(tool: RegisteredTool): void {
    this.tools.set(tool.definition.name, tool);
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  listAllowed(permissions: Permissions): ToolDefinition[] {
    const allTools = this.list();
    if (permissions.tools.length === 0) return allTools;
    return allTools.filter((t) => permissions.tools.includes(t.name));
  }

  async execute(
    name: string,
    args: Record<string, unknown>,
    callId: string,
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        toolCallId: callId,
        name,
        result: `Error: Tool "${name}" not found`,
        isError: true,
      };
    }

    try {
      const result = await tool.execute(args);
      return { toolCallId: callId, name, result, isError: false };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { toolCallId: callId, name, result: `Error: ${message}`, isError: true };
    }
  }
}
