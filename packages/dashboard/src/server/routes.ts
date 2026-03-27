import { Hono } from 'hono';
import { listAgents, listAgentGroups, getAgent } from './k8s-client.js';
import { getAgentMessages, getThreadMessages, isNatsAvailable } from './nats-client.js';
import { listRuns, getRun, getSpans } from './trace-store.js';

const api = new Hono();

api.get('/agents', async (c) => {
  const namespace = c.req.query('namespace') ?? 'kube-agents';
  try {
    const agents = await listAgents(namespace);
    return c.json(agents);
  } catch (err) {
    console.error('Failed to list agents:', err);
    return c.json({ error: 'Failed to list agents' }, 500);
  }
});

api.get('/agents/:namespace/:name', async (c) => {
  const { namespace, name } = c.req.param();
  try {
    const agent = await getAgent(namespace, name);
    if (!agent) return c.json({ error: 'Agent not found' }, 404);
    return c.json(agent);
  } catch (err) {
    console.error('Failed to get agent:', err);
    return c.json({ error: 'Failed to get agent' }, 500);
  }
});

api.get('/agents/:namespace/:name/messages', async (c) => {
  const { namespace, name } = c.req.param();
  const limit = Number(c.req.query('limit') ?? '50');

  if (!isNatsAvailable()) {
    return c.json({ error: 'NATS not available' }, 503);
  }

  try {
    // First get the agent to find its email and groups
    const agent = await getAgent(namespace, name);
    if (!agent) return c.json({ error: 'Agent not found' }, 404);

    const result = await getAgentMessages(
      agent.spec.identity.email,
      agent.spec.identity.groups ?? [],
      { limit },
    );
    return c.json(result);
  } catch (err) {
    console.error('Failed to get agent messages:', err);
    return c.json({ error: 'Failed to get agent messages' }, 500);
  }
});

api.get('/threads/:threadId', async (c) => {
  const { threadId } = c.req.param();

  if (!isNatsAvailable()) {
    return c.json({ error: 'NATS not available' }, 503);
  }

  try {
    const messages = await getThreadMessages(threadId);
    return c.json({ messages });
  } catch (err) {
    console.error('Failed to get thread messages:', err);
    return c.json({ error: 'Failed to get thread messages' }, 500);
  }
});

api.get('/agentgroups', async (c) => {
  const namespace = c.req.query('namespace') ?? 'kube-agents';
  try {
    const groups = await listAgentGroups(namespace);
    return c.json(groups);
  } catch (err) {
    console.error('Failed to list agent groups:', err);
    return c.json({ error: 'Failed to list agent groups' }, 500);
  }
});

api.get('/overview', async (c) => {
  const namespace = c.req.query('namespace') ?? 'kube-agents';
  const [agentsResult, groupsResult] = await Promise.allSettled([
    listAgents(namespace),
    listAgentGroups(namespace),
  ]);

  const agents = agentsResult.status === 'fulfilled' ? agentsResult.value : [];
  const groups = groupsResult.status === 'fulfilled' ? groupsResult.value : [];

  if (agentsResult.status === 'rejected') {
    console.error('Failed to list agents:', agentsResult.reason);
  }
  if (groupsResult.status === 'rejected') {
    console.error('Failed to list agent groups:', groupsResult.reason);
  }

  return c.json({ agents, groups });
});

// --- Trace endpoints ---

api.get('/traces', (c) => {
  const agentName = c.req.query('agentName');
  const status = c.req.query('status');
  const limit = Number(c.req.query('limit') ?? '50');
  const offset = Number(c.req.query('offset') ?? '0');
  return c.json(listRuns({ agentName, status, limit, offset }));
});

api.get('/traces/:runId', (c) => {
  const { runId } = c.req.param();
  const run = getRun(runId);
  if (!run) return c.json({ error: 'Run not found' }, 404);
  return c.json({ run, spans: getSpans(runId) });
});

api.get('/traces/:runId/spans', (c) => {
  const { runId } = c.req.param();
  const run = getRun(runId);
  if (!run) return c.json({ error: 'Run not found' }, 404);
  return c.json({ spans: getSpans(runId) });
});

api.get('/agents/:namespace/:name/traces', (c) => {
  const { name } = c.req.param();
  const limit = Number(c.req.query('limit') ?? '50');
  const offset = Number(c.req.query('offset') ?? '0');
  return c.json(listRuns({ agentName: name, limit, offset }));
});

export { api };
