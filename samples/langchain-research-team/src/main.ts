/**
 * Entry point for the LangChain Research Team sample.
 *
 * Each kube-agent Pod runs this with a different AGENT_ROLE env var
 * to determine which LangChain agent graph to load.
 *
 * Environment variables:
 *   AGENT_ROLE        — "researcher" | "analyst" | "writer" (required)
 *   AGENT_NAME        — agent display name (default: derived from role)
 *   AGENT_EMAIL       — agent email address (required)
 *   AGENT_GROUPS      — comma-separated group emails (optional)
 *   NATS_URL          — NATS server URL (default: nats://nats:4222)
 *   ANTHROPIC_API_KEY — Claude API key (required)
 *   LLM_MODEL         — model override (default: claude-sonnet-4-20250514)
 */
import type { AgentIdentity } from '@kube-agents/core';
import { MailBridge, type GraphFactory } from './mail-bridge.js';
import { buildResearcherGraph } from './agents/researcher.js';
import { buildAnalystGraph } from './agents/analyst.js';
import { buildWriterGraph } from './agents/writer.js';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

const AGENT_FACTORIES: Record<string, GraphFactory> = {
  researcher: buildResearcherGraph,
  analyst: buildAnalystGraph,
  writer: buildWriterGraph,
};

async function main() {
  const role = requiredEnv('AGENT_ROLE');
  const graphFactory = AGENT_FACTORIES[role];
  if (!graphFactory) {
    console.error(`Unknown AGENT_ROLE: ${role}. Must be one of: ${Object.keys(AGENT_FACTORIES).join(', ')}`);
    process.exit(1);
  }

  const identity: AgentIdentity = {
    name: process.env.AGENT_NAME ?? role,
    email: requiredEnv('AGENT_EMAIL'),
    groups: process.env.AGENT_GROUPS?.split(',').filter(Boolean) ?? [],
  };

  const natsUrl = process.env.NATS_URL ?? 'nats://nats:4222';

  console.log(`Starting ${role} agent as ${identity.email}`);
  console.log(`NATS: ${natsUrl}`);

  const bridge = new MailBridge({
    identity,
    nats: { servers: [natsUrl] },
    graphFactory,
  });

  await bridge.start();
  console.log(`${role} agent is ready.`);

  // Graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down...');
    await bridge.stop();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
