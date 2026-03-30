import pg from 'pg';
import type {
  Project,
  Trace,
  Run,
  Feedback,
  Dataset,
  Example,
  Experiment,
  ExperimentResult,
} from '@kube-agents/core';

const { Pool } = pg;

// ---------------------------------------------------------------------------
// Database initialization
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env['DATABASE_URL'] ?? 'postgresql://kubeagents:kubeagents@localhost:5432/kubeagents';

let pool: pg.Pool;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({ connectionString: DATABASE_URL, max: 10 });
  }
  return pool;
}

export async function initDb(): Promise<void> {
  const p = getPool();
  await migrate(p);
  console.log('[db] PostgreSQL database initialized');
}

export async function closeDb(): Promise<void> {
  await pool?.end();
}

// ---------------------------------------------------------------------------
// Schema migration
// ---------------------------------------------------------------------------

async function migrate(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS traces (
      id UUID PRIMARY KEY,
      project_id UUID NOT NULL REFERENCES projects(id),
      name TEXT NOT NULL,
      session_id TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      inputs JSONB,
      outputs JSONB,
      error TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      started_at TIMESTAMPTZ NOT NULL,
      completed_at TIMESTAMPTZ,
      total_latency_ms DOUBLE PRECISION,
      total_tokens INTEGER DEFAULT 0,
      prompt_tokens INTEGER DEFAULT 0,
      completion_tokens INTEGER DEFAULT 0,
      cost DOUBLE PRECISION
    );
    CREATE INDEX IF NOT EXISTS idx_traces_project ON traces(project_id);
    CREATE INDEX IF NOT EXISTS idx_traces_session ON traces(session_id);
    CREATE INDEX IF NOT EXISTS idx_traces_status ON traces(status);
    CREATE INDEX IF NOT EXISTS idx_traces_started ON traces(started_at DESC);

    CREATE TABLE IF NOT EXISTS runs (
      id UUID PRIMARY KEY,
      trace_id UUID NOT NULL REFERENCES traces(id),
      parent_run_id UUID REFERENCES runs(id),
      name TEXT NOT NULL,
      run_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      inputs JSONB,
      outputs JSONB,
      error TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      started_at TIMESTAMPTZ NOT NULL,
      completed_at TIMESTAMPTZ,
      latency_ms DOUBLE PRECISION,
      prompt_tokens INTEGER,
      completion_tokens INTEGER,
      total_tokens INTEGER,
      model TEXT,
      provider TEXT,
      temperature DOUBLE PRECISION,
      prompt_messages JSONB,
      completion TEXT,
      finish_reason TEXT,
      tool_calls JSONB NOT NULL DEFAULT '[]'::jsonb
    );
    CREATE INDEX IF NOT EXISTS idx_runs_trace ON runs(trace_id);
    CREATE INDEX IF NOT EXISTS idx_runs_parent ON runs(parent_run_id);
    CREATE INDEX IF NOT EXISTS idx_runs_type ON runs(run_type);
    CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at DESC);

    CREATE TABLE IF NOT EXISTS feedback (
      id UUID PRIMARY KEY,
      run_id UUID REFERENCES runs(id),
      trace_id UUID NOT NULL REFERENCES traces(id),
      key TEXT NOT NULL,
      score DOUBLE PRECISION,
      value TEXT,
      comment TEXT,
      source TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_feedback_trace ON feedback(trace_id);
    CREATE INDEX IF NOT EXISTS idx_feedback_run ON feedback(run_id);
    CREATE INDEX IF NOT EXISTS idx_feedback_key ON feedback(key);

    CREATE TABLE IF NOT EXISTS datasets (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS examples (
      id UUID PRIMARY KEY,
      dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
      inputs JSONB NOT NULL,
      expected_outputs JSONB,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      split TEXT,
      source_run_id UUID,
      created_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_examples_dataset ON examples(dataset_id);

    CREATE TABLE IF NOT EXISTS experiments (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      dataset_id UUID NOT NULL REFERENCES datasets(id),
      description TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'running',
      created_at TIMESTAMPTZ NOT NULL,
      completed_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_experiments_dataset ON experiments(dataset_id);

    CREATE TABLE IF NOT EXISTS experiment_results (
      id UUID PRIMARY KEY,
      experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
      example_id UUID NOT NULL REFERENCES examples(id),
      trace_id UUID REFERENCES traces(id),
      outputs JSONB,
      latency_ms DOUBLE PRECISION,
      total_tokens INTEGER,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_results_experiment ON experiment_results(experiment_id);
  `);
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function upsertProject(project: Project): Promise<void> {
  await getPool().query(
    `INSERT INTO projects (id, name, description, metadata, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT(name) DO UPDATE SET
       description = COALESCE(excluded.description, projects.description),
       metadata = excluded.metadata,
       updated_at = excluded.updated_at`,
    [project.id, project.name, project.description ?? null,
     project.metadata, project.createdAt, project.updatedAt],
  );
}

export async function getProjectByName(name: string): Promise<Project | undefined> {
  const { rows } = await getPool().query(
    'SELECT * FROM projects WHERE name = $1', [name],
  );
  return rows[0] ? mapProject(rows[0]) : undefined;
}

export async function listProjects(): Promise<Project[]> {
  const { rows } = await getPool().query(
    'SELECT * FROM projects ORDER BY updated_at DESC',
  );
  return rows.map(mapProject);
}

function mapProject(row: Record<string, unknown>): Project {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) ?? undefined,
    metadata: (row.metadata as Record<string, string>) ?? {},
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

// ---------------------------------------------------------------------------
// Traces
// ---------------------------------------------------------------------------

export async function upsertTrace(trace: Trace): Promise<void> {
  await getPool().query(
    `INSERT INTO traces (id, project_id, name, session_id, status, inputs, outputs, error,
       metadata, tags, started_at, completed_at, total_latency_ms,
       total_tokens, prompt_tokens, completion_tokens, cost)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status,
       outputs = COALESCE(excluded.outputs, traces.outputs),
       error = excluded.error,
       metadata = excluded.metadata,
       tags = excluded.tags,
       completed_at = excluded.completed_at,
       total_latency_ms = excluded.total_latency_ms,
       total_tokens = excluded.total_tokens,
       prompt_tokens = excluded.prompt_tokens,
       completion_tokens = excluded.completion_tokens,
       cost = excluded.cost`,
    [trace.id, trace.projectId, trace.name, trace.sessionId ?? null,
     trace.status, trace.inputs ?? null, trace.outputs ?? null,
     trace.error ?? null, trace.metadata, JSON.stringify(trace.tags ?? []),
     trace.startedAt, trace.completedAt ?? null,
     trace.totalLatencyMs ?? null, trace.totalTokens,
     trace.promptTokens, trace.completionTokens, trace.cost ?? null],
  );
}

export interface TraceListOptions {
  projectId?: string;
  sessionId?: string;
  status?: string;
  name?: string;
  limit?: number;
  offset?: number;
}

export interface TraceListResult {
  traces: Trace[];
  total: number;
  hasMore: boolean;
}

export async function listTraces(options: TraceListOptions = {}): Promise<TraceListResult> {
  const { projectId, sessionId, status, name, limit = 50, offset = 0 } = options;
  const p = getPool();

  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (projectId) {
    conditions.push(`project_id = $${idx++}`);
    params.push(projectId);
  }
  if (sessionId) {
    conditions.push(`session_id = $${idx++}`);
    params.push(sessionId);
  }
  if (status) {
    conditions.push(`status = $${idx++}`);
    params.push(status);
  }
  if (name) {
    conditions.push(`name LIKE $${idx++}`);
    params.push(`%${name}%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await p.query(
    `SELECT COUNT(*)::int as count FROM traces ${where}`, params,
  );
  const total = countResult.rows[0].count as number;

  const { rows } = await p.query(
    `SELECT * FROM traces ${where} ORDER BY started_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset],
  );

  return {
    traces: rows.map(mapTrace),
    total,
    hasMore: offset + limit < total,
  };
}

export async function getTrace(traceId: string): Promise<Trace | undefined> {
  const { rows } = await getPool().query(
    'SELECT * FROM traces WHERE id = $1', [traceId],
  );
  return rows[0] ? mapTrace(rows[0]) : undefined;
}

function mapTrace(row: Record<string, unknown>): Trace {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    name: row.name as string,
    sessionId: (row.session_id as string) ?? undefined,
    status: row.status as Trace['status'],
    inputs: (row.inputs as Record<string, unknown>) ?? undefined,
    outputs: (row.outputs as Record<string, unknown>) ?? undefined,
    error: (row.error as string) ?? undefined,
    metadata: (row.metadata as Record<string, string>) ?? {},
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    startedAt: new Date(row.started_at as string),
    completedAt: row.completed_at ? new Date(row.completed_at as string) : undefined,
    totalLatencyMs: (row.total_latency_ms as number) ?? undefined,
    totalTokens: (row.total_tokens as number) ?? 0,
    promptTokens: (row.prompt_tokens as number) ?? 0,
    completionTokens: (row.completion_tokens as number) ?? 0,
    cost: (row.cost as number) ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

export async function insertRun(run: Run): Promise<void> {
  await getPool().query(
    `INSERT INTO runs (id, trace_id, parent_run_id, name, run_type, status,
       inputs, outputs, error, metadata, tags, started_at, completed_at, latency_ms,
       prompt_tokens, completion_tokens, total_tokens, model, provider, temperature,
       prompt_messages, completion, finish_reason, tool_calls)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
             $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status,
       outputs = COALESCE(excluded.outputs, runs.outputs),
       error = excluded.error,
       completed_at = excluded.completed_at,
       latency_ms = excluded.latency_ms`,
    [run.id, run.traceId, run.parentRunId ?? null, run.name, run.runType,
     run.status, run.inputs ?? null, run.outputs ?? null,
     run.error ?? null, run.metadata, JSON.stringify(run.tags ?? []),
     run.startedAt, run.completedAt ?? null, run.latencyMs ?? null,
     run.promptTokens ?? null, run.completionTokens ?? null,
     run.totalTokens ?? null, run.model ?? null, run.provider ?? null,
     run.temperature ?? null, run.promptMessages ?? null,
     run.completion ?? null, run.finishReason ?? null, run.toolCalls],
  );
}

export async function listRunsForTrace(traceId: string): Promise<Run[]> {
  const { rows } = await getPool().query(
    'SELECT * FROM runs WHERE trace_id = $1 ORDER BY started_at ASC', [traceId],
  );
  return rows.map(mapRun);
}

export async function getRun(runId: string): Promise<Run | undefined> {
  const { rows } = await getPool().query(
    'SELECT * FROM runs WHERE id = $1', [runId],
  );
  return rows[0] ? mapRun(rows[0]) : undefined;
}

function mapRun(row: Record<string, unknown>): Run {
  return {
    id: row.id as string,
    traceId: row.trace_id as string,
    parentRunId: (row.parent_run_id as string) ?? undefined,
    name: row.name as string,
    runType: row.run_type as Run['runType'],
    status: row.status as Run['status'],
    inputs: (row.inputs as Record<string, unknown>) ?? undefined,
    outputs: (row.outputs as Record<string, unknown>) ?? undefined,
    error: (row.error as string) ?? undefined,
    metadata: (row.metadata as Record<string, string>) ?? {},
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    startedAt: new Date(row.started_at as string),
    completedAt: row.completed_at ? new Date(row.completed_at as string) : undefined,
    latencyMs: (row.latency_ms as number) ?? undefined,
    promptTokens: (row.prompt_tokens as number) ?? undefined,
    completionTokens: (row.completion_tokens as number) ?? undefined,
    totalTokens: (row.total_tokens as number) ?? undefined,
    model: (row.model as string) ?? undefined,
    provider: (row.provider as string) ?? undefined,
    temperature: (row.temperature as number) ?? undefined,
    promptMessages: (row.prompt_messages as Run['promptMessages']) ?? undefined,
    completion: (row.completion as string) ?? undefined,
    finishReason: (row.finish_reason as string) ?? undefined,
    toolCalls: (row.tool_calls as Run['toolCalls']) ?? [],
  };
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export async function insertFeedback(feedback: Feedback): Promise<void> {
  await getPool().query(
    `INSERT INTO feedback (id, run_id, trace_id, key, score, value, comment, source, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [feedback.id, feedback.runId ?? null, feedback.traceId, feedback.key,
     feedback.score ?? null, feedback.value ?? null, feedback.comment ?? null,
     feedback.source, feedback.createdAt],
  );
}

export async function listFeedbackForTrace(traceId: string): Promise<Feedback[]> {
  const { rows } = await getPool().query(
    'SELECT * FROM feedback WHERE trace_id = $1 ORDER BY created_at DESC', [traceId],
  );
  return rows.map(mapFeedback);
}

export async function listFeedbackForRun(runId: string): Promise<Feedback[]> {
  const { rows } = await getPool().query(
    'SELECT * FROM feedback WHERE run_id = $1 ORDER BY created_at DESC', [runId],
  );
  return rows.map(mapFeedback);
}

export async function deleteFeedback(id: string): Promise<boolean> {
  const result = await getPool().query('DELETE FROM feedback WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

function mapFeedback(row: Record<string, unknown>): Feedback {
  return {
    id: row.id as string,
    runId: (row.run_id as string) ?? undefined,
    traceId: row.trace_id as string,
    key: row.key as string,
    score: (row.score as number) ?? undefined,
    value: (row.value as string) ?? undefined,
    comment: (row.comment as string) ?? undefined,
    source: row.source as Feedback['source'],
    createdAt: new Date(row.created_at as string),
  };
}

// ---------------------------------------------------------------------------
// Datasets
// ---------------------------------------------------------------------------

export async function insertDataset(dataset: Dataset): Promise<void> {
  await getPool().query(
    `INSERT INTO datasets (id, name, description, metadata, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [dataset.id, dataset.name, dataset.description ?? null,
     dataset.metadata, dataset.createdAt, dataset.updatedAt],
  );
}

export async function updateDataset(
  id: string,
  updates: { name?: string; description?: string; metadata?: Record<string, string> },
): Promise<boolean> {
  const sets: string[] = ['updated_at = $1'];
  const params: unknown[] = [new Date()];
  let idx = 2;

  if (updates.name !== undefined) {
    sets.push(`name = $${idx++}`);
    params.push(updates.name);
  }
  if (updates.description !== undefined) {
    sets.push(`description = $${idx++}`);
    params.push(updates.description);
  }
  if (updates.metadata !== undefined) {
    sets.push(`metadata = $${idx++}`);
    params.push(updates.metadata);
  }

  params.push(id);
  const result = await getPool().query(
    `UPDATE datasets SET ${sets.join(', ')} WHERE id = $${idx}`, params,
  );
  return (result.rowCount ?? 0) > 0;
}

export async function getDataset(id: string): Promise<Dataset | undefined> {
  const { rows } = await getPool().query(
    'SELECT * FROM datasets WHERE id = $1', [id],
  );
  return rows[0] ? mapDataset(rows[0]) : undefined;
}

export async function listDatasets(): Promise<Dataset[]> {
  const { rows } = await getPool().query(
    'SELECT * FROM datasets ORDER BY updated_at DESC',
  );
  return rows.map(mapDataset);
}

export async function deleteDataset(id: string): Promise<boolean> {
  const result = await getPool().query('DELETE FROM datasets WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

function mapDataset(row: Record<string, unknown>): Dataset {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) ?? undefined,
    metadata: (row.metadata as Record<string, string>) ?? {},
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

// ---------------------------------------------------------------------------
// Examples
// ---------------------------------------------------------------------------

export async function insertExample(example: Example): Promise<void> {
  await getPool().query(
    `INSERT INTO examples (id, dataset_id, inputs, expected_outputs, metadata, split, source_run_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [example.id, example.datasetId, example.inputs,
     example.expectedOutputs ?? null, example.metadata,
     example.split ?? null, example.sourceRunId ?? null, example.createdAt],
  );
}

export async function listExamples(datasetId: string, split?: string): Promise<Example[]> {
  if (split) {
    const { rows } = await getPool().query(
      'SELECT * FROM examples WHERE dataset_id = $1 AND split = $2 ORDER BY created_at DESC',
      [datasetId, split],
    );
    return rows.map(mapExample);
  }
  const { rows } = await getPool().query(
    'SELECT * FROM examples WHERE dataset_id = $1 ORDER BY created_at DESC', [datasetId],
  );
  return rows.map(mapExample);
}

export async function getExample(id: string): Promise<Example | undefined> {
  const { rows } = await getPool().query(
    'SELECT * FROM examples WHERE id = $1', [id],
  );
  return rows[0] ? mapExample(rows[0]) : undefined;
}

export async function updateExample(
  id: string,
  updates: { inputs?: Record<string, unknown>; expectedOutputs?: Record<string, unknown>; metadata?: Record<string, string>; split?: string },
): Promise<boolean> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (updates.inputs !== undefined) {
    sets.push(`inputs = $${idx++}`);
    params.push(updates.inputs);
  }
  if (updates.expectedOutputs !== undefined) {
    sets.push(`expected_outputs = $${idx++}`);
    params.push(updates.expectedOutputs);
  }
  if (updates.metadata !== undefined) {
    sets.push(`metadata = $${idx++}`);
    params.push(updates.metadata);
  }
  if (updates.split !== undefined) {
    sets.push(`split = $${idx++}`);
    params.push(updates.split);
  }

  if (sets.length === 0) return false;
  params.push(id);
  const result = await getPool().query(
    `UPDATE examples SET ${sets.join(', ')} WHERE id = $${idx}`, params,
  );
  return (result.rowCount ?? 0) > 0;
}

export async function deleteExample(id: string): Promise<boolean> {
  const result = await getPool().query('DELETE FROM examples WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

function mapExample(row: Record<string, unknown>): Example {
  return {
    id: row.id as string,
    datasetId: row.dataset_id as string,
    inputs: (row.inputs as Record<string, unknown>) ?? {},
    expectedOutputs: (row.expected_outputs as Record<string, unknown>) ?? undefined,
    metadata: (row.metadata as Record<string, string>) ?? {},
    split: (row.split as string) ?? undefined,
    sourceRunId: (row.source_run_id as string) ?? undefined,
    createdAt: new Date(row.created_at as string),
  };
}

// ---------------------------------------------------------------------------
// Experiments
// ---------------------------------------------------------------------------

export async function insertExperiment(experiment: Experiment): Promise<void> {
  await getPool().query(
    `INSERT INTO experiments (id, name, dataset_id, description, metadata, status, created_at, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [experiment.id, experiment.name, experiment.datasetId,
     experiment.description ?? null, experiment.metadata, experiment.status,
     experiment.createdAt, experiment.completedAt ?? null],
  );
}

export async function updateExperiment(
  id: string,
  updates: { status?: string; completedAt?: Date },
): Promise<boolean> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (updates.status !== undefined) {
    sets.push(`status = $${idx++}`);
    params.push(updates.status);
  }
  if (updates.completedAt !== undefined) {
    sets.push(`completed_at = $${idx++}`);
    params.push(updates.completedAt);
  }

  if (sets.length === 0) return false;
  params.push(id);
  const result = await getPool().query(
    `UPDATE experiments SET ${sets.join(', ')} WHERE id = $${idx}`, params,
  );
  return (result.rowCount ?? 0) > 0;
}

export async function getExperiment(id: string): Promise<Experiment | undefined> {
  const { rows } = await getPool().query(
    'SELECT * FROM experiments WHERE id = $1', [id],
  );
  return rows[0] ? mapExperiment(rows[0]) : undefined;
}

export async function listExperiments(datasetId?: string): Promise<Experiment[]> {
  if (datasetId) {
    const { rows } = await getPool().query(
      'SELECT * FROM experiments WHERE dataset_id = $1 ORDER BY created_at DESC', [datasetId],
    );
    return rows.map(mapExperiment);
  }
  const { rows } = await getPool().query(
    'SELECT * FROM experiments ORDER BY created_at DESC',
  );
  return rows.map(mapExperiment);
}

export async function deleteExperiment(id: string): Promise<boolean> {
  const result = await getPool().query('DELETE FROM experiments WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

function mapExperiment(row: Record<string, unknown>): Experiment {
  return {
    id: row.id as string,
    name: row.name as string,
    datasetId: row.dataset_id as string,
    description: (row.description as string) ?? undefined,
    metadata: (row.metadata as Record<string, string>) ?? {},
    status: row.status as Experiment['status'],
    createdAt: new Date(row.created_at as string),
    completedAt: row.completed_at ? new Date(row.completed_at as string) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Experiment Results
// ---------------------------------------------------------------------------

export async function insertExperimentResult(result: ExperimentResult): Promise<void> {
  await getPool().query(
    `INSERT INTO experiment_results (id, experiment_id, example_id, trace_id, outputs, latency_ms, total_tokens, error, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [result.id, result.experimentId, result.exampleId,
     result.traceId ?? null, result.outputs ?? null,
     result.latencyMs ?? null, result.totalTokens ?? null,
     result.error ?? null, result.createdAt],
  );
}

export async function listExperimentResults(experimentId: string): Promise<ExperimentResult[]> {
  const { rows } = await getPool().query(
    'SELECT * FROM experiment_results WHERE experiment_id = $1 ORDER BY created_at ASC', [experimentId],
  );
  return rows.map(mapExperimentResult);
}

function mapExperimentResult(row: Record<string, unknown>): ExperimentResult {
  return {
    id: row.id as string,
    experimentId: row.experiment_id as string,
    exampleId: row.example_id as string,
    traceId: (row.trace_id as string) ?? undefined,
    outputs: (row.outputs as Record<string, unknown>) ?? undefined,
    latencyMs: (row.latency_ms as number) ?? undefined,
    totalTokens: (row.total_tokens as number) ?? undefined,
    error: (row.error as string) ?? undefined,
    createdAt: new Date(row.created_at as string),
  };
}

// ---------------------------------------------------------------------------
// Aggregate metrics
// ---------------------------------------------------------------------------

export interface AgentMetrics {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  traceCount: number;
  lastTraceAt: string | null;
}

export async function getAgentMetrics(agentName: string): Promise<AgentMetrics | null> {
  const { rows } = await getPool().query(
    `SELECT
       COUNT(t.id)::int as trace_count,
       COALESCE(SUM(t.total_tokens), 0)::int as total_tokens,
       COALESCE(SUM(t.prompt_tokens), 0)::int as prompt_tokens,
       COALESCE(SUM(t.completion_tokens), 0)::int as completion_tokens,
       MAX(t.started_at) as last_trace_at
     FROM projects p
     JOIN traces t ON t.project_id = p.id
     WHERE p.name = $1`,
    [agentName],
  );

  const row = rows[0];
  if (!row || row.trace_count === 0) return null;

  return {
    totalTokens: row.total_tokens as number,
    promptTokens: row.prompt_tokens as number,
    completionTokens: row.completion_tokens as number,
    traceCount: row.trace_count as number,
    lastTraceAt: row.last_trace_at ? new Date(row.last_trace_at as string).toISOString() : null,
  };
}

export interface ProjectStats {
  projectId: string;
  projectName: string;
  traceCount: number;
  runCount: number;
  avgLatencyMs: number | null;
  totalTokens: number;
  errorCount: number;
  lastTraceAt: string | null;
}

export async function getProjectStats(): Promise<ProjectStats[]> {
  const { rows } = await getPool().query(`
    SELECT
      p.id as project_id,
      p.name as project_name,
      COUNT(DISTINCT t.id)::int as trace_count,
      COUNT(r.id)::int as run_count,
      AVG(t.total_latency_ms) as avg_latency_ms,
      COALESCE(SUM(t.total_tokens), 0)::int as total_tokens,
      COUNT(CASE WHEN t.status = 'error' THEN 1 END)::int as error_count,
      MAX(t.started_at) as last_trace_at
    FROM projects p
    LEFT JOIN traces t ON t.project_id = p.id
    LEFT JOIN runs r ON r.trace_id = t.id
    GROUP BY p.id
    ORDER BY last_trace_at DESC NULLS LAST
  `);

  return rows.map((r) => ({
    projectId: r.project_id as string,
    projectName: r.project_name as string,
    traceCount: r.trace_count as number,
    runCount: r.run_count as number,
    avgLatencyMs: r.avg_latency_ms as number | null,
    totalTokens: r.total_tokens as number,
    errorCount: r.error_count as number,
    lastTraceAt: r.last_trace_at ? new Date(r.last_trace_at as string).toISOString() : null,
  }));
}

// ---------------------------------------------------------------------------
// Time-series metrics
// ---------------------------------------------------------------------------

export type TimeGranularity = 'hour' | 'day' | 'week';

export interface TimeSeriesPoint {
  bucket: string;
  traceCount: number;
  errorCount: number;
  avgLatencyMs: number | null;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
}

export interface TimeSeriesOptions {
  projectId?: string;
  granularity?: TimeGranularity;
  buckets?: number;
}

export async function getTimeSeries(options: TimeSeriesOptions = {}): Promise<TimeSeriesPoint[]> {
  const { projectId, granularity = 'hour', buckets = 24 } = options;
  const p = getPool();

  const trunc = `date_trunc('${granularity}', started_at)`;
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (projectId) {
    conditions.push(`project_id = $${idx++}`);
    params.push(projectId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await p.query(
    `SELECT
       ${trunc} as bucket,
       COUNT(*)::int as trace_count,
       COUNT(CASE WHEN status = 'error' THEN 1 END)::int as error_count,
       AVG(total_latency_ms) as avg_latency_ms,
       COALESCE(SUM(total_tokens), 0)::int as total_tokens,
       COALESCE(SUM(prompt_tokens), 0)::int as prompt_tokens,
       COALESCE(SUM(completion_tokens), 0)::int as completion_tokens
     FROM traces
     ${where}
     GROUP BY bucket
     ORDER BY bucket DESC
     LIMIT $${idx++}`,
    [...params, buckets],
  );

  return rows.reverse().map((r) => ({
    bucket: new Date(r.bucket as string).toISOString(),
    traceCount: r.trace_count as number,
    errorCount: r.error_count as number,
    avgLatencyMs: r.avg_latency_ms as number | null,
    totalTokens: r.total_tokens as number,
    promptTokens: r.prompt_tokens as number,
    completionTokens: r.completion_tokens as number,
  }));
}

// ---------------------------------------------------------------------------
// Model usage breakdown
// ---------------------------------------------------------------------------

export interface ModelUsage {
  model: string;
  provider: string;
  callCount: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  avgLatencyMs: number | null;
}

export async function getModelUsage(projectId?: string): Promise<ModelUsage[]> {
  const conditions: string[] = ['model IS NOT NULL'];
  const params: unknown[] = [];
  let idx = 1;

  if (projectId) {
    conditions.push(`r.trace_id IN (SELECT id FROM traces WHERE project_id = $${idx++})`);
    params.push(projectId);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const { rows } = await getPool().query(
    `SELECT
       COALESCE(r.model, 'unknown') as model,
       COALESCE(r.provider, 'unknown') as provider,
       COUNT(*)::int as call_count,
       COALESCE(SUM(r.total_tokens), 0)::int as total_tokens,
       COALESCE(SUM(r.prompt_tokens), 0)::int as prompt_tokens,
       COALESCE(SUM(r.completion_tokens), 0)::int as completion_tokens,
       AVG(r.latency_ms) as avg_latency_ms
     FROM runs r
     ${where}
     GROUP BY r.model, r.provider
     ORDER BY total_tokens DESC`,
    params,
  );

  return rows.map((r) => ({
    model: r.model as string,
    provider: r.provider as string,
    callCount: r.call_count as number,
    totalTokens: r.total_tokens as number,
    promptTokens: r.prompt_tokens as number,
    completionTokens: r.completion_tokens as number,
    avgLatencyMs: r.avg_latency_ms as number | null,
  }));
}

// ---------------------------------------------------------------------------
// Error rate per project
// ---------------------------------------------------------------------------

export interface ErrorRate {
  projectId: string;
  projectName: string;
  total: number;
  errors: number;
  rate: number;
}

export async function getErrorRates(): Promise<ErrorRate[]> {
  const { rows } = await getPool().query(`
    SELECT
      p.id as project_id,
      p.name as project_name,
      COUNT(t.id)::int as total,
      COUNT(CASE WHEN t.status = 'error' THEN 1 END)::int as errors
    FROM projects p
    LEFT JOIN traces t ON t.project_id = p.id
    GROUP BY p.id
    HAVING COUNT(t.id) > 0
    ORDER BY errors DESC
  `);

  return rows.map((r) => ({
    projectId: r.project_id as string,
    projectName: r.project_name as string,
    total: r.total as number,
    errors: r.errors as number,
    rate: (r.total as number) > 0 ? (r.errors as number) / (r.total as number) : 0,
  }));
}
