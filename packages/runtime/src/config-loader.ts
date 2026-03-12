import { readFile } from 'node:fs/promises';
import { AgentSpecSchema, type AgentSpec, ValidationError } from '@kube-agents/core';

export async function loadAgentSpec(configPath: string): Promise<AgentSpec> {
  try {
    const raw = await readFile(configPath, 'utf-8');
    const data = JSON.parse(raw);
    return AgentSpecSchema.parse(data);
  } catch (err) {
    throw new ValidationError(
      `Failed to load agent spec from ${configPath}: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }
}

export function loadAgentSpecFromEnv(): AgentSpec {
  const specJson = process.env['AGENT_SPEC'];
  if (!specJson) {
    throw new ValidationError('AGENT_SPEC environment variable not set');
  }

  try {
    const data = JSON.parse(specJson);
    return AgentSpecSchema.parse(data);
  } catch (err) {
    throw new ValidationError(
      `Failed to parse AGENT_SPEC: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }
}
