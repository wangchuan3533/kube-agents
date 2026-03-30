import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { listAgents, listAgentGroups, getAgent } from './k8s-client.js';
import { getAgentMessages, getThreadMessages, isNatsAvailable } from './nats-client.js';
import {
  listTraces,
  getTrace,
  listRunsForTrace,
  getRun,
  listProjects,
  getProjectByName,
  getProjectStats,
  insertFeedback,
  listFeedbackForTrace,
  listFeedbackForRun,
  deleteFeedback,
  insertDataset,
  updateDataset,
  getDataset,
  listDatasets,
  deleteDataset,
  insertExample,
  listExamples,
  getExample,
  updateExample,
  deleteExample,
  listExperiments,
  getExperiment,
  deleteExperiment,
  listExperimentResults,
  getTimeSeries,
  getModelUsage,
  getErrorRates,
  type TimeGranularity,
} from './db.js';

const api = new Hono();

// ---------------------------------------------------------------------------
// Agent endpoints (K8s)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Project endpoints
// ---------------------------------------------------------------------------

api.get('/projects', (c) => {
  const projects = listProjects();
  const stats = getProjectStats();
  return c.json({ projects, stats });
});

api.get('/projects/:name', (c) => {
  const { name } = c.req.param();
  const project = getProjectByName(name);
  if (!project) return c.json({ error: 'Project not found' }, 404);
  return c.json(project);
});

api.get('/projects/:name/traces', (c) => {
  const { name } = c.req.param();
  const project = getProjectByName(name);
  if (!project) return c.json({ error: 'Project not found' }, 404);

  const status = c.req.query('status');
  const limit = Number(c.req.query('limit') ?? '50');
  const offset = Number(c.req.query('offset') ?? '0');
  return c.json(listTraces({ projectId: project.id, status, limit, offset }));
});

// ---------------------------------------------------------------------------
// Trace endpoints (SQLite-backed)
// ---------------------------------------------------------------------------

api.get('/traces', (c) => {
  const agentName = c.req.query('agentName');
  const status = c.req.query('status');
  const sessionId = c.req.query('sessionId');
  const limit = Number(c.req.query('limit') ?? '50');
  const offset = Number(c.req.query('offset') ?? '0');

  // If filtering by agentName, resolve project first
  let projectId: string | undefined;
  if (agentName) {
    const project = getProjectByName(agentName);
    projectId = project?.id;
    if (!projectId) {
      return c.json({ traces: [], total: 0, hasMore: false });
    }
  }

  return c.json(listTraces({ projectId, sessionId, status, limit, offset }));
});

api.get('/traces/:traceId', (c) => {
  const { traceId } = c.req.param();
  const trace = getTrace(traceId);
  if (!trace) return c.json({ error: 'Trace not found' }, 404);
  const runs = listRunsForTrace(traceId);
  const feedback = listFeedbackForTrace(traceId);
  return c.json({ trace, runs, feedback });
});

api.get('/traces/:traceId/runs', (c) => {
  const { traceId } = c.req.param();
  const trace = getTrace(traceId);
  if (!trace) return c.json({ error: 'Trace not found' }, 404);
  return c.json({ runs: listRunsForTrace(traceId) });
});

api.get('/agents/:namespace/:name/traces', (c) => {
  const { name } = c.req.param();
  const limit = Number(c.req.query('limit') ?? '50');
  const offset = Number(c.req.query('offset') ?? '0');

  const project = getProjectByName(name);
  if (!project) {
    return c.json({ traces: [], total: 0, hasMore: false });
  }

  return c.json(listTraces({ projectId: project.id, limit, offset }));
});

// ---------------------------------------------------------------------------
// Feedback endpoints
// ---------------------------------------------------------------------------

api.post('/feedback', async (c) => {
  try {
    const body = await c.req.json();
    const feedback = {
      id: randomUUID(),
      runId: body.runId,
      traceId: body.traceId,
      key: body.key,
      score: body.score,
      value: body.value,
      comment: body.comment,
      source: body.source ?? 'human',
      createdAt: new Date(),
    };
    insertFeedback(feedback);
    return c.json(feedback, 201);
  } catch (err) {
    console.error('Failed to create feedback:', err);
    return c.json({ error: 'Failed to create feedback' }, 500);
  }
});

api.get('/traces/:traceId/feedback', (c) => {
  const { traceId } = c.req.param();
  return c.json({ feedback: listFeedbackForTrace(traceId) });
});

api.get('/runs/:runId/feedback', (c) => {
  const { runId } = c.req.param();
  return c.json({ feedback: listFeedbackForRun(runId) });
});

api.delete('/feedback/:id', (c) => {
  const { id } = c.req.param();
  const deleted = deleteFeedback(id);
  if (!deleted) return c.json({ error: 'Feedback not found' }, 404);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Dataset endpoints
// ---------------------------------------------------------------------------

api.post('/datasets', async (c) => {
  try {
    const body = await c.req.json();
    const now = new Date();
    const dataset = {
      id: randomUUID(),
      name: body.name,
      description: body.description,
      metadata: body.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    };
    insertDataset(dataset);
    return c.json(dataset, 201);
  } catch (err) {
    console.error('Failed to create dataset:', err);
    return c.json({ error: 'Failed to create dataset' }, 500);
  }
});

api.get('/datasets', (c) => {
  return c.json({ datasets: listDatasets() });
});

api.get('/datasets/:id', (c) => {
  const { id } = c.req.param();
  const dataset = getDataset(id);
  if (!dataset) return c.json({ error: 'Dataset not found' }, 404);
  const examples = listExamples(id);
  return c.json({ dataset, exampleCount: examples.length });
});

api.put('/datasets/:id', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  const updated = updateDataset(id, body);
  if (!updated) return c.json({ error: 'Dataset not found' }, 404);
  return c.json({ ok: true });
});

api.delete('/datasets/:id', (c) => {
  const { id } = c.req.param();
  const deleted = deleteDataset(id);
  if (!deleted) return c.json({ error: 'Dataset not found' }, 404);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Example endpoints
// ---------------------------------------------------------------------------

api.post('/datasets/:id/examples', async (c) => {
  const { id } = c.req.param();
  const dataset = getDataset(id);
  if (!dataset) return c.json({ error: 'Dataset not found' }, 404);

  try {
    const body = await c.req.json();
    const items = Array.isArray(body) ? body : [body];
    const results = items.map((item) => {
      const example = {
        id: randomUUID(),
        datasetId: id,
        inputs: item.inputs,
        expectedOutputs: item.expectedOutputs,
        metadata: item.metadata ?? {},
        split: item.split,
        sourceRunId: item.sourceRunId,
        createdAt: new Date(),
      };
      insertExample(example);
      return example;
    });
    return c.json({ examples: results }, 201);
  } catch (err) {
    console.error('Failed to create examples:', err);
    return c.json({ error: 'Failed to create examples' }, 500);
  }
});

api.get('/datasets/:id/examples', (c) => {
  const { id } = c.req.param();
  const split = c.req.query('split');
  return c.json({ examples: listExamples(id, split) });
});

api.put('/examples/:id', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  const updated = updateExample(id, body);
  if (!updated) return c.json({ error: 'Example not found' }, 404);
  return c.json({ ok: true });
});

api.delete('/examples/:id', (c) => {
  const { id } = c.req.param();
  const deleted = deleteExample(id);
  if (!deleted) return c.json({ error: 'Example not found' }, 404);
  return c.json({ ok: true });
});

// Create example from a trace
api.post('/traces/:traceId/to-example', async (c) => {
  const { traceId } = c.req.param();
  const trace = getTrace(traceId);
  if (!trace) return c.json({ error: 'Trace not found' }, 404);

  try {
    const body = await c.req.json();
    const example = {
      id: randomUUID(),
      datasetId: body.datasetId,
      inputs: trace.inputs ?? {},
      expectedOutputs: trace.outputs ?? body.expectedOutputs,
      metadata: { sourceTraceId: traceId, ...trace.metadata },
      split: body.split,
      sourceRunId: undefined,
      createdAt: new Date(),
    };
    insertExample(example);
    return c.json(example, 201);
  } catch (err) {
    console.error('Failed to create example from trace:', err);
    return c.json({ error: 'Failed to create example from trace' }, 500);
  }
});

// ---------------------------------------------------------------------------
// Experiment endpoints
// ---------------------------------------------------------------------------

api.post('/experiments', async (c) => {
  try {
    const body = await c.req.json();
    const { name, datasetId, description, evaluators, metadata, split } = body;

    if (!name || !datasetId) {
      return c.json({ error: 'name and datasetId are required' }, 400);
    }

    const { runManualExperiment } = await import('./experiment-runner.js');
    const summary = await runManualExperiment(name, datasetId, evaluators ?? [], metadata ?? {});
    return c.json(summary, 201);
  } catch (err) {
    console.error('Failed to run experiment:', err);
    return c.json({ error: err instanceof Error ? err.message : 'Failed to run experiment' }, 500);
  }
});

api.get('/experiments', (c) => {
  const datasetId = c.req.query('datasetId');
  return c.json({ experiments: listExperiments(datasetId) });
});

api.get('/experiments/:id', (c) => {
  const { id } = c.req.param();
  const experiment = getExperiment(id);
  if (!experiment) return c.json({ error: 'Experiment not found' }, 404);
  const results = listExperimentResults(id);
  return c.json({ experiment, results });
});

api.delete('/experiments/:id', (c) => {
  const { id } = c.req.param();
  const deleted = deleteExperiment(id);
  if (!deleted) return c.json({ error: 'Experiment not found' }, 404);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Monitoring endpoints
// ---------------------------------------------------------------------------

api.get('/monitoring/timeseries', (c) => {
  const projectId = c.req.query('projectId');
  const granularity = (c.req.query('granularity') ?? 'hour') as TimeGranularity;
  const buckets = Number(c.req.query('buckets') ?? '24');
  return c.json({ data: getTimeSeries({ projectId, granularity, buckets }) });
});

api.get('/monitoring/models', (c) => {
  const projectId = c.req.query('projectId');
  return c.json({ data: getModelUsage(projectId) });
});

api.get('/monitoring/errors', (c) => {
  return c.json({ data: getErrorRates() });
});

api.get('/monitoring/summary', (c) => {
  const stats = getProjectStats();
  const timeseries = getTimeSeries({ granularity: 'hour', buckets: 24 });
  const models = getModelUsage();
  const errors = getErrorRates();

  const totalTraces = stats.reduce((s, p) => s + p.traceCount, 0);
  const totalTokens = stats.reduce((s, p) => s + p.totalTokens, 0);
  const totalErrors = stats.reduce((s, p) => s + p.errorCount, 0);
  const avgLatency = stats.filter((p) => p.avgLatencyMs != null);
  const overallAvgLatency = avgLatency.length > 0
    ? avgLatency.reduce((s, p) => s + p.avgLatencyMs!, 0) / avgLatency.length
    : null;

  return c.json({
    summary: {
      totalTraces,
      totalTokens,
      totalErrors,
      errorRate: totalTraces > 0 ? totalErrors / totalTraces : 0,
      avgLatencyMs: overallAvgLatency,
      projectCount: stats.length,
    },
    timeseries,
    models,
    errors,
    projectStats: stats,
  });
});

export { api };
