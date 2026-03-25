/**
 * Runtime entrypoint — runs inside each agent Pod.
 *
 * Reads the agent spec from a ConfigMap-mounted file or env var,
 * then starts the agent loop.
 */
import { Agent } from './agent.js';
import { loadAgentSpec, loadAgentSpecFromEnv } from './config-loader.js';

const configPath = process.env['AGENT_CONFIG_PATH'];
const spec = configPath ? await loadAgentSpec(configPath) : loadAgentSpecFromEnv();

const natsUrl = process.env['NATS_URL'] ?? 'nats://nats:4222';
const apiKey = process.env['LLM_API_KEY'] ?? process.env['ANTHROPIC_API_KEY'] ?? process.env['OPENAI_API_KEY'];

console.log(`Starting agent: ${spec.identity.name} (${spec.identity.email})`);
console.log(`NATS: ${natsUrl}`);

const agent = new Agent({
  spec,
  nats: { servers: [natsUrl] },
  apiKey,
});

const shutdown = async () => {
  console.log('Shutting down...');
  await agent.stop();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await agent.start();
