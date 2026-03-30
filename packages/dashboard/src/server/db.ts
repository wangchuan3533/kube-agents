import Database from 'better-sqlite3';
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

// ---------------------------------------------------------------------------
// Database initialization
// ---------------------------------------------------------------------------

const DB_PATH = process.env['DATABASE_PATH'] ?? './data/kube-agents.db';

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    migrate(db);
  }
  return db;
}

export function closeDb(): void {
  db?.close();
}

// ---------------------------------------------------------------------------
// Schema migration
// ---------------------------------------------------------------------------

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS traces (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      name TEXT NOT NULL,
      session_id TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      inputs TEXT,
      outputs TEXT,
      error TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      tags TEXT NOT NULL DEFAULT '[]',
      started_at TEXT NOT NULL,
      completed_at TEXT,
      total_latency_ms REAL,
      total_tokens INTEGER DEFAULT 0,
      prompt_tokens INTEGER DEFAULT 0,
      completion_tokens INTEGER DEFAULT 0,
      cost REAL
    );
    CREATE INDEX IF NOT EXISTS idx_traces_project ON traces(project_id);
    CREATE INDEX IF NOT EXISTS idx_traces_session ON traces(session_id);
    CREATE INDEX IF NOT EXISTS idx_traces_status ON traces(status);
    CREATE INDEX IF NOT EXISTS idx_traces_started ON traces(started_at DESC);

    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      trace_id TEXT NOT NULL REFERENCES traces(id),
      parent_run_id TEXT REFERENCES runs(id),
      name TEXT NOT NULL,
      run_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      inputs TEXT,
      outputs TEXT,
      error TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      tags TEXT NOT NULL DEFAULT '[]',
      started_at TEXT NOT NULL,
      completed_at TEXT,
      latency_ms REAL,
      prompt_tokens INTEGER,
      completion_tokens INTEGER,
      total_tokens INTEGER,
      model TEXT,
      provider TEXT,
      temperature REAL,
      prompt_messages TEXT,
      completion TEXT,
      finish_reason TEXT,
      tool_calls TEXT NOT NULL DEFAULT '[]'
    );
    CREATE INDEX IF NOT EXISTS idx_runs_trace ON runs(trace_id);
    CREATE INDEX IF NOT EXISTS idx_runs_parent ON runs(parent_run_id);
    CREATE INDEX IF NOT EXISTS idx_runs_type ON runs(run_type);
    CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at DESC);

    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      run_id TEXT REFERENCES runs(id),
      trace_id TEXT NOT NULL REFERENCES traces(id),
      key TEXT NOT NULL,
      score REAL,
      value TEXT,
      comment TEXT,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_feedback_trace ON feedback(trace_id);
    CREATE INDEX IF NOT EXISTS idx_feedback_run ON feedback(run_id);
    CREATE INDEX IF NOT EXISTS idx_feedback_key ON feedback(key);

    CREATE TABLE IF NOT EXISTS datasets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS examples (
      id TEXT PRIMARY KEY,
      dataset_id TEXT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
      inputs TEXT NOT NULL,
      expected_outputs TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      split TEXT,
      source_run_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_examples_dataset ON examples(dataset_id);

    CREATE TABLE IF NOT EXISTS experiments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      dataset_id TEXT NOT NULL REFERENCES datasets(id),
      description TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'running',
      created_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_experiments_dataset ON experiments(dataset_id);

    CREATE TABLE IF NOT EXISTS experiment_results (
      id TEXT PRIMARY KEY,
      experiment_id TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
      example_id TEXT NOT NULL REFERENCES examples(id),
      trace_id TEXT REFERENCES traces(id),
      outputs TEXT,
      latency_ms REAL,
      total_tokens INTEGER,
      error TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_results_experiment ON experiment_results(experiment_id);
  `);

  console.log('[db] SQLite database initialized at', DB_PATH);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toISOString(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : d;
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export function upsertProject(project: Project): void {
  const d = getDb();
  d.prepare(`
    INSERT INTO projects (id, name, description, metadata, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      description = COALESCE(excluded.description, description),
      metadata = excluded.metadata,
      updated_at = excluded.updated_at
  `).run(
    project.id,
    project.name,
    project.description ?? null,
    JSON.stringify(project.metadata),
    toISOString(project.createdAt),
    toISOString(project.updatedAt),
  );
}

export function getProjectByName(name: string): Project | undefined {
  const row = getDb()
    .prepare('SELECT * FROM projects WHERE name = ?')
    .get(name) as ProjectRow | undefined;
  return row ? mapProject(row) : undefined;
}

export function listProjects(): Project[] {
  const rows = getDb()
    .prepare('SELECT * FROM projects ORDER BY updated_at DESC')
    .all() as ProjectRow[];
  return rows.map(mapProject);
}

interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  metadata: string;
  created_at: string;
  updated_at: string;
}

function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    metadata: parseJson(row.metadata, {}),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

// ---------------------------------------------------------------------------
// Traces
// ---------------------------------------------------------------------------

export function upsertTrace(trace: Trace): void {
  const d = getDb();
  d.prepare(`
    INSERT INTO traces (id, project_id, name, session_id, status, inputs, outputs, error,
      metadata, tags, started_at, completed_at, total_latency_ms,
      total_tokens, prompt_tokens, completion_tokens, cost)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      outputs = COALESCE(excluded.outputs, outputs),
      error = excluded.error,
      metadata = excluded.metadata,
      tags = excluded.tags,
      completed_at = excluded.completed_at,
      total_latency_ms = excluded.total_latency_ms,
      total_tokens = excluded.total_tokens,
      prompt_tokens = excluded.prompt_tokens,
      completion_tokens = excluded.completion_tokens,
      cost = excluded.cost
  `).run(
    trace.id,
    trace.projectId,
    trace.name,
    trace.sessionId ?? null,
    trace.status,
    trace.inputs ? JSON.stringify(trace.inputs) : null,
    trace.outputs ? JSON.stringify(trace.outputs) : null,
    trace.error ?? null,
    JSON.stringify(trace.metadata),
    JSON.stringify(trace.tags),
    toISOString(trace.startedAt),
    trace.completedAt ? toISOString(trace.completedAt) : null,
    trace.totalLatencyMs ?? null,
    trace.totalTokens,
    trace.promptTokens,
    trace.completionTokens,
    trace.cost ?? null,
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

export function listTraces(options: TraceListOptions = {}): TraceListResult {
  const { projectId, sessionId, status, name, limit = 50, offset = 0 } = options;
  const d = getDb();

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (projectId) {
    conditions.push('project_id = ?');
    params.push(projectId);
  }
  if (sessionId) {
    conditions.push('session_id = ?');
    params.push(sessionId);
  }
  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }
  if (name) {
    conditions.push('name LIKE ?');
    params.push(`%${name}%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = (
    d.prepare(`SELECT COUNT(*) as count FROM traces ${where}`).get(...params) as { count: number }
  ).count;

  const rows = d
    .prepare(`SELECT * FROM traces ${where} ORDER BY started_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as TraceRow[];

  return {
    traces: rows.map(mapTrace),
    total,
    hasMore: offset + limit < total,
  };
}

export function getTrace(traceId: string): Trace | undefined {
  const row = getDb()
    .prepare('SELECT * FROM traces WHERE id = ?')
    .get(traceId) as TraceRow | undefined;
  return row ? mapTrace(row) : undefined;
}

interface TraceRow {
  id: string;
  project_id: string;
  name: string;
  session_id: string | null;
  status: string;
  inputs: string | null;
  outputs: string | null;
  error: string | null;
  metadata: string;
  tags: string;
  started_at: string;
  completed_at: string | null;
  total_latency_ms: number | null;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  cost: number | null;
}

function mapTrace(row: TraceRow): Trace {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    sessionId: row.session_id ?? undefined,
    status: row.status as Trace['status'],
    inputs: parseJson(row.inputs, undefined),
    outputs: parseJson(row.outputs, undefined),
    error: row.error ?? undefined,
    metadata: parseJson(row.metadata, {}),
    tags: parseJson(row.tags, []),
    startedAt: new Date(row.started_at),
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    totalLatencyMs: row.total_latency_ms ?? undefined,
    totalTokens: row.total_tokens,
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    cost: row.cost ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

export function insertRun(run: Run): void {
  getDb().prepare(`
    INSERT INTO runs (id, trace_id, parent_run_id, name, run_type, status,
      inputs, outputs, error, metadata, tags, started_at, completed_at, latency_ms,
      prompt_tokens, completion_tokens, total_tokens, model, provider, temperature,
      prompt_messages, completion, finish_reason, tool_calls)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      outputs = COALESCE(excluded.outputs, outputs),
      error = excluded.error,
      completed_at = excluded.completed_at,
      latency_ms = excluded.latency_ms
  `).run(
    run.id,
    run.traceId,
    run.parentRunId ?? null,
    run.name,
    run.runType,
    run.status,
    run.inputs ? JSON.stringify(run.inputs) : null,
    run.outputs ? JSON.stringify(run.outputs) : null,
    run.error ?? null,
    JSON.stringify(run.metadata),
    JSON.stringify(run.tags),
    toISOString(run.startedAt),
    run.completedAt ? toISOString(run.completedAt) : null,
    run.latencyMs ?? null,
    run.promptTokens ?? null,
    run.completionTokens ?? null,
    run.totalTokens ?? null,
    run.model ?? null,
    run.provider ?? null,
    run.temperature ?? null,
    run.promptMessages ? JSON.stringify(run.promptMessages) : null,
    run.completion ?? null,
    run.finishReason ?? null,
    JSON.stringify(run.toolCalls),
  );
}

export function listRunsForTrace(traceId: string): Run[] {
  const rows = getDb()
    .prepare('SELECT * FROM runs WHERE trace_id = ? ORDER BY started_at ASC')
    .all(traceId) as RunRow[];
  return rows.map(mapRun);
}

export function getRun(runId: string): Run | undefined {
  const row = getDb()
    .prepare('SELECT * FROM runs WHERE id = ?')
    .get(runId) as RunRow | undefined;
  return row ? mapRun(row) : undefined;
}

interface RunRow {
  id: string;
  trace_id: string;
  parent_run_id: string | null;
  name: string;
  run_type: string;
  status: string;
  inputs: string | null;
  outputs: string | null;
  error: string | null;
  metadata: string;
  tags: string;
  started_at: string;
  completed_at: string | null;
  latency_ms: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  model: string | null;
  provider: string | null;
  temperature: number | null;
  prompt_messages: string | null;
  completion: string | null;
  finish_reason: string | null;
  tool_calls: string;
}

function mapRun(row: RunRow): Run {
  return {
    id: row.id,
    traceId: row.trace_id,
    parentRunId: row.parent_run_id ?? undefined,
    name: row.name,
    runType: row.run_type as Run['runType'],
    status: row.status as Run['status'],
    inputs: parseJson(row.inputs, undefined),
    outputs: parseJson(row.outputs, undefined),
    error: row.error ?? undefined,
    metadata: parseJson(row.metadata, {}),
    tags: parseJson(row.tags, []),
    startedAt: new Date(row.started_at),
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    latencyMs: row.latency_ms ?? undefined,
    promptTokens: row.prompt_tokens ?? undefined,
    completionTokens: row.completion_tokens ?? undefined,
    totalTokens: row.total_tokens ?? undefined,
    model: row.model ?? undefined,
    provider: row.provider ?? undefined,
    temperature: row.temperature ?? undefined,
    promptMessages: parseJson(row.prompt_messages, undefined),
    completion: row.completion ?? undefined,
    finishReason: row.finish_reason ?? undefined,
    toolCalls: parseJson(row.tool_calls, []),
  };
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export function insertFeedback(feedback: Feedback): void {
  getDb().prepare(`
    INSERT INTO feedback (id, run_id, trace_id, key, score, value, comment, source, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    feedback.id,
    feedback.runId ?? null,
    feedback.traceId,
    feedback.key,
    feedback.score ?? null,
    feedback.value ?? null,
    feedback.comment ?? null,
    feedback.source,
    toISOString(feedback.createdAt),
  );
}

export function listFeedbackForTrace(traceId: string): Feedback[] {
  const rows = getDb()
    .prepare('SELECT * FROM feedback WHERE trace_id = ? ORDER BY created_at DESC')
    .all(traceId) as FeedbackRow[];
  return rows.map(mapFeedback);
}

export function listFeedbackForRun(runId: string): Feedback[] {
  const rows = getDb()
    .prepare('SELECT * FROM feedback WHERE run_id = ? ORDER BY created_at DESC')
    .all(runId) as FeedbackRow[];
  return rows.map(mapFeedback);
}

export function deleteFeedback(id: string): boolean {
  const result = getDb().prepare('DELETE FROM feedback WHERE id = ?').run(id);
  return result.changes > 0;
}

interface FeedbackRow {
  id: string;
  run_id: string | null;
  trace_id: string;
  key: string;
  score: number | null;
  value: string | null;
  comment: string | null;
  source: string;
  created_at: string;
}

function mapFeedback(row: FeedbackRow): Feedback {
  return {
    id: row.id,
    runId: row.run_id ?? undefined,
    traceId: row.trace_id,
    key: row.key,
    score: row.score ?? undefined,
    value: row.value ?? undefined,
    comment: row.comment ?? undefined,
    source: row.source as Feedback['source'],
    createdAt: new Date(row.created_at),
  };
}

// ---------------------------------------------------------------------------
// Datasets
// ---------------------------------------------------------------------------

export function insertDataset(dataset: Dataset): void {
  getDb().prepare(`
    INSERT INTO datasets (id, name, description, metadata, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    dataset.id,
    dataset.name,
    dataset.description ?? null,
    JSON.stringify(dataset.metadata),
    toISOString(dataset.createdAt),
    toISOString(dataset.updatedAt),
  );
}

export function updateDataset(id: string, updates: { name?: string; description?: string; metadata?: Record<string, string> }): boolean {
  const sets: string[] = ['updated_at = ?'];
  const params: unknown[] = [new Date().toISOString()];

  if (updates.name !== undefined) {
    sets.push('name = ?');
    params.push(updates.name);
  }
  if (updates.description !== undefined) {
    sets.push('description = ?');
    params.push(updates.description);
  }
  if (updates.metadata !== undefined) {
    sets.push('metadata = ?');
    params.push(JSON.stringify(updates.metadata));
  }

  params.push(id);
  const result = getDb()
    .prepare(`UPDATE datasets SET ${sets.join(', ')} WHERE id = ?`)
    .run(...params);
  return result.changes > 0;
}

export function getDataset(id: string): Dataset | undefined {
  const row = getDb()
    .prepare('SELECT * FROM datasets WHERE id = ?')
    .get(id) as DatasetRow | undefined;
  return row ? mapDataset(row) : undefined;
}

export function listDatasets(): Dataset[] {
  const rows = getDb()
    .prepare('SELECT * FROM datasets ORDER BY updated_at DESC')
    .all() as DatasetRow[];
  return rows.map(mapDataset);
}

export function deleteDataset(id: string): boolean {
  const result = getDb().prepare('DELETE FROM datasets WHERE id = ?').run(id);
  return result.changes > 0;
}

interface DatasetRow {
  id: string;
  name: string;
  description: string | null;
  metadata: string;
  created_at: string;
  updated_at: string;
}

function mapDataset(row: DatasetRow): Dataset {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    metadata: parseJson(row.metadata, {}),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

// ---------------------------------------------------------------------------
// Examples
// ---------------------------------------------------------------------------

export function insertExample(example: Example): void {
  getDb().prepare(`
    INSERT INTO examples (id, dataset_id, inputs, expected_outputs, metadata, split, source_run_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    example.id,
    example.datasetId,
    JSON.stringify(example.inputs),
    example.expectedOutputs ? JSON.stringify(example.expectedOutputs) : null,
    JSON.stringify(example.metadata),
    example.split ?? null,
    example.sourceRunId ?? null,
    toISOString(example.createdAt),
  );
}

export function listExamples(datasetId: string, split?: string): Example[] {
  if (split) {
    const rows = getDb()
      .prepare('SELECT * FROM examples WHERE dataset_id = ? AND split = ? ORDER BY created_at DESC')
      .all(datasetId, split) as ExampleRow[];
    return rows.map(mapExample);
  }
  const rows = getDb()
    .prepare('SELECT * FROM examples WHERE dataset_id = ? ORDER BY created_at DESC')
    .all(datasetId) as ExampleRow[];
  return rows.map(mapExample);
}

export function getExample(id: string): Example | undefined {
  const row = getDb()
    .prepare('SELECT * FROM examples WHERE id = ?')
    .get(id) as ExampleRow | undefined;
  return row ? mapExample(row) : undefined;
}

export function updateExample(id: string, updates: { inputs?: Record<string, unknown>; expectedOutputs?: Record<string, unknown>; metadata?: Record<string, string>; split?: string }): boolean {
  const sets: string[] = [];
  const params: unknown[] = [];

  if (updates.inputs !== undefined) {
    sets.push('inputs = ?');
    params.push(JSON.stringify(updates.inputs));
  }
  if (updates.expectedOutputs !== undefined) {
    sets.push('expected_outputs = ?');
    params.push(JSON.stringify(updates.expectedOutputs));
  }
  if (updates.metadata !== undefined) {
    sets.push('metadata = ?');
    params.push(JSON.stringify(updates.metadata));
  }
  if (updates.split !== undefined) {
    sets.push('split = ?');
    params.push(updates.split);
  }

  if (sets.length === 0) return false;
  params.push(id);
  const result = getDb()
    .prepare(`UPDATE examples SET ${sets.join(', ')} WHERE id = ?`)
    .run(...params);
  return result.changes > 0;
}

export function deleteExample(id: string): boolean {
  const result = getDb().prepare('DELETE FROM examples WHERE id = ?').run(id);
  return result.changes > 0;
}

interface ExampleRow {
  id: string;
  dataset_id: string;
  inputs: string;
  expected_outputs: string | null;
  metadata: string;
  split: string | null;
  source_run_id: string | null;
  created_at: string;
}

function mapExample(row: ExampleRow): Example {
  return {
    id: row.id,
    datasetId: row.dataset_id,
    inputs: parseJson(row.inputs, {}),
    expectedOutputs: parseJson(row.expected_outputs, undefined),
    metadata: parseJson(row.metadata, {}),
    split: row.split ?? undefined,
    sourceRunId: row.source_run_id ?? undefined,
    createdAt: new Date(row.created_at),
  };
}

// ---------------------------------------------------------------------------
// Experiments
// ---------------------------------------------------------------------------

export function insertExperiment(experiment: Experiment): void {
  getDb().prepare(`
    INSERT INTO experiments (id, name, dataset_id, description, metadata, status, created_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    experiment.id,
    experiment.name,
    experiment.datasetId,
    experiment.description ?? null,
    JSON.stringify(experiment.metadata),
    experiment.status,
    toISOString(experiment.createdAt),
    experiment.completedAt ? toISOString(experiment.completedAt) : null,
  );
}

export function updateExperiment(id: string, updates: { status?: string; completedAt?: Date }): boolean {
  const sets: string[] = [];
  const params: unknown[] = [];

  if (updates.status !== undefined) {
    sets.push('status = ?');
    params.push(updates.status);
  }
  if (updates.completedAt !== undefined) {
    sets.push('completed_at = ?');
    params.push(toISOString(updates.completedAt));
  }

  if (sets.length === 0) return false;
  params.push(id);
  const result = getDb()
    .prepare(`UPDATE experiments SET ${sets.join(', ')} WHERE id = ?`)
    .run(...params);
  return result.changes > 0;
}

export function getExperiment(id: string): Experiment | undefined {
  const row = getDb()
    .prepare('SELECT * FROM experiments WHERE id = ?')
    .get(id) as ExperimentRow | undefined;
  return row ? mapExperiment(row) : undefined;
}

export function listExperiments(datasetId?: string): Experiment[] {
  if (datasetId) {
    const rows = getDb()
      .prepare('SELECT * FROM experiments WHERE dataset_id = ? ORDER BY created_at DESC')
      .all(datasetId) as ExperimentRow[];
    return rows.map(mapExperiment);
  }
  const rows = getDb()
    .prepare('SELECT * FROM experiments ORDER BY created_at DESC')
    .all() as ExperimentRow[];
  return rows.map(mapExperiment);
}

export function deleteExperiment(id: string): boolean {
  const result = getDb().prepare('DELETE FROM experiments WHERE id = ?').run(id);
  return result.changes > 0;
}

interface ExperimentRow {
  id: string;
  name: string;
  dataset_id: string;
  description: string | null;
  metadata: string;
  status: string;
  created_at: string;
  completed_at: string | null;
}

function mapExperiment(row: ExperimentRow): Experiment {
  return {
    id: row.id,
    name: row.name,
    datasetId: row.dataset_id,
    description: row.description ?? undefined,
    metadata: parseJson(row.metadata, {}),
    status: row.status as Experiment['status'],
    createdAt: new Date(row.created_at),
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Experiment Results
// ---------------------------------------------------------------------------

export function insertExperimentResult(result: ExperimentResult): void {
  getDb().prepare(`
    INSERT INTO experiment_results (id, experiment_id, example_id, trace_id, outputs, latency_ms, total_tokens, error, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    result.id,
    result.experimentId,
    result.exampleId,
    result.traceId ?? null,
    result.outputs ? JSON.stringify(result.outputs) : null,
    result.latencyMs ?? null,
    result.totalTokens ?? null,
    result.error ?? null,
    toISOString(result.createdAt),
  );
}

export function listExperimentResults(experimentId: string): ExperimentResult[] {
  const rows = getDb()
    .prepare('SELECT * FROM experiment_results WHERE experiment_id = ? ORDER BY created_at ASC')
    .all(experimentId) as ExperimentResultRow[];
  return rows.map(mapExperimentResult);
}

interface ExperimentResultRow {
  id: string;
  experiment_id: string;
  example_id: string;
  trace_id: string | null;
  outputs: string | null;
  latency_ms: number | null;
  total_tokens: number | null;
  error: string | null;
  created_at: string;
}

function mapExperimentResult(row: ExperimentResultRow): ExperimentResult {
  return {
    id: row.id,
    experimentId: row.experiment_id,
    exampleId: row.example_id,
    traceId: row.trace_id ?? undefined,
    outputs: parseJson(row.outputs, undefined),
    latencyMs: row.latency_ms ?? undefined,
    totalTokens: row.total_tokens ?? undefined,
    error: row.error ?? undefined,
    createdAt: new Date(row.created_at),
  };
}

// ---------------------------------------------------------------------------
// Aggregate metrics
// ---------------------------------------------------------------------------

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

export function getProjectStats(): ProjectStats[] {
  const rows = getDb().prepare(`
    SELECT
      p.id as project_id,
      p.name as project_name,
      COUNT(DISTINCT t.id) as trace_count,
      COUNT(r.id) as run_count,
      AVG(t.total_latency_ms) as avg_latency_ms,
      COALESCE(SUM(t.total_tokens), 0) as total_tokens,
      COUNT(CASE WHEN t.status = 'error' THEN 1 END) as error_count,
      MAX(t.started_at) as last_trace_at
    FROM projects p
    LEFT JOIN traces t ON t.project_id = p.id
    LEFT JOIN runs r ON r.trace_id = t.id
    GROUP BY p.id
    ORDER BY last_trace_at DESC
  `).all() as Array<{
    project_id: string;
    project_name: string;
    trace_count: number;
    run_count: number;
    avg_latency_ms: number | null;
    total_tokens: number;
    error_count: number;
    last_trace_at: string | null;
  }>;

  return rows.map((r) => ({
    projectId: r.project_id,
    projectName: r.project_name,
    traceCount: r.trace_count,
    runCount: r.run_count,
    avgLatencyMs: r.avg_latency_ms,
    totalTokens: r.total_tokens,
    errorCount: r.error_count,
    lastTraceAt: r.last_trace_at,
  }));
}

// ---------------------------------------------------------------------------
// Time-series metrics
// ---------------------------------------------------------------------------

export type TimeGranularity = 'hour' | 'day' | 'week';

export interface TimeSeriesPoint {
  bucket: string; // ISO date string for the bucket start
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
  /** Number of buckets to return (default 24) */
  buckets?: number;
}

function sqliteDateTrunc(granularity: TimeGranularity): string {
  switch (granularity) {
    case 'hour':
      return "strftime('%Y-%m-%dT%H:00:00Z', started_at)";
    case 'day':
      return "strftime('%Y-%m-%dT00:00:00Z', started_at)";
    case 'week':
      return "strftime('%Y-%m-%dT00:00:00Z', started_at, 'weekday 0', '-6 days')";
  }
}

export function getTimeSeries(options: TimeSeriesOptions = {}): TimeSeriesPoint[] {
  const { projectId, granularity = 'hour', buckets = 24 } = options;
  const d = getDb();

  const trunc = sqliteDateTrunc(granularity);
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (projectId) {
    conditions.push('project_id = ?');
    params.push(projectId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = d.prepare(`
    SELECT
      ${trunc} as bucket,
      COUNT(*) as trace_count,
      COUNT(CASE WHEN status = 'error' THEN 1 END) as error_count,
      AVG(total_latency_ms) as avg_latency_ms,
      COALESCE(SUM(total_tokens), 0) as total_tokens,
      COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
      COALESCE(SUM(completion_tokens), 0) as completion_tokens
    FROM traces
    ${where}
    GROUP BY bucket
    ORDER BY bucket DESC
    LIMIT ?
  `).all(...params, buckets) as Array<{
    bucket: string;
    trace_count: number;
    error_count: number;
    avg_latency_ms: number | null;
    total_tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
  }>;

  return rows.reverse().map((r) => ({
    bucket: r.bucket,
    traceCount: r.trace_count,
    errorCount: r.error_count,
    avgLatencyMs: r.avg_latency_ms,
    totalTokens: r.total_tokens,
    promptTokens: r.prompt_tokens,
    completionTokens: r.completion_tokens,
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

export function getModelUsage(projectId?: string): ModelUsage[] {
  const d = getDb();
  const conditions: string[] = ["model IS NOT NULL"];
  const params: unknown[] = [];

  if (projectId) {
    conditions.push('r.trace_id IN (SELECT id FROM traces WHERE project_id = ?)');
    params.push(projectId);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const rows = d.prepare(`
    SELECT
      COALESCE(r.model, 'unknown') as model,
      COALESCE(r.provider, 'unknown') as provider,
      COUNT(*) as call_count,
      COALESCE(SUM(r.total_tokens), 0) as total_tokens,
      COALESCE(SUM(r.prompt_tokens), 0) as prompt_tokens,
      COALESCE(SUM(r.completion_tokens), 0) as completion_tokens,
      AVG(r.latency_ms) as avg_latency_ms
    FROM runs r
    ${where}
    GROUP BY r.model, r.provider
    ORDER BY total_tokens DESC
  `).all(...params) as Array<{
    model: string;
    provider: string;
    call_count: number;
    total_tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
    avg_latency_ms: number | null;
  }>;

  return rows.map((r) => ({
    model: r.model,
    provider: r.provider,
    callCount: r.call_count,
    totalTokens: r.total_tokens,
    promptTokens: r.prompt_tokens,
    completionTokens: r.completion_tokens,
    avgLatencyMs: r.avg_latency_ms,
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

export function getErrorRates(): ErrorRate[] {
  const rows = getDb().prepare(`
    SELECT
      p.id as project_id,
      p.name as project_name,
      COUNT(t.id) as total,
      COUNT(CASE WHEN t.status = 'error' THEN 1 END) as errors
    FROM projects p
    LEFT JOIN traces t ON t.project_id = p.id
    GROUP BY p.id
    HAVING total > 0
    ORDER BY errors DESC
  `).all() as Array<{
    project_id: string;
    project_name: string;
    total: number;
    errors: number;
  }>;

  return rows.map((r) => ({
    projectId: r.project_id,
    projectName: r.project_name,
    total: r.total,
    errors: r.errors,
    rate: r.total > 0 ? r.errors / r.total : 0,
  }));
}
