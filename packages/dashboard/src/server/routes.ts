import { Hono } from 'hono';
import { listAgents, listAgentGroups } from './k8s-client.js';

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

export { api };
