# Observability Restructure Plan

## Goal
Restructure kube-agents dashboard and runtime towards a LangSmith-inspired observability platform covering: tracing, evaluation, monitoring, experiments, and prompt management.

## Phase 0: Documentation & API Reference

### Allowed APIs (verified from docs)

**better-sqlite3 (v12.8.0)**
- `new Database(path, { timeout, verbose })` — constructor
- `db.pragma('journal_mode = WAL')` — WAL mode for concurrent reads
- `db.exec(sql)` — multi-statement DDL (migrations)
- `db.prepare(sql)` — returns Statement
- `stmt.run(...params)` — INSERT/UPDATE/DELETE → `{ changes, lastInsertRowid }`
- `stmt.get(...params)` — SELECT one → `T | undefined`
- `stmt.all(...params)` — SELECT many → `T[]`
- `db.transaction(fn)` — sync-only transactions (no async!)
- TypeScript: `db.prepare<[string], Row>(sql)` for typed queries
- Native module: needs `python3 make g++` in Docker, platform must match runtime
- Single-writer constraint: one pod writes, multiple can read

**Anti-patterns**
- Do NOT use async inside `db.transaction()` — it commits at first `await`
- Do NOT share SQLite file across multiple writer pods
- Do NOT use `@types/better-sqlite3` generics incorrectly — bind params first, result second

### Current Architecture (verified from codebase)

**Data flow:** Runtime (Tracer) → NATS JetStream → Dashboard (consumer) → in-memory Map → REST API → React polling UI

**Current schemas** (packages/core/src/schemas/trace.ts):
- `TraceRun`: id, agentName, agentEmail, emailId, threadId?, status, tokens, iterations, latency
- `TraceSpan`: id, runId, agentName, type(llm_call|tool_call), timing, llm?{}, tool?{}

**Current storage** (packages/dashboard/src/server/trace-store.ts):
- `Map<string, TraceRun>` + `Map<string, TraceSpan[]>` — 1000 run LRU, lost on restart

**Current API** (packages/dashboard/src/server/routes.ts — Hono framework):
- `GET /api/traces` — list with agentName/status/limit/offset filters
- `GET /api/traces/:runId` — single run + spans
- `GET /api/agents/:ns/:name/traces` — agent-scoped traces

**Current UI** (4 pages, hash router):
- OverviewPage, AgentDetailPage (4 tabs), TracesPage, TraceDetailPage
- Components: TraceRunTable, SpanTimeline, PromptViewer, JsonViewer, MetricCard

---

## Phase 1: Storage Foundation & Data Model

### Objective
Replace in-memory trace store with SQLite. Extend data model to support LangSmith hierarchy (Project → Trace → Run → Feedback) and evaluation entities (Dataset → Example → Experiment).

### Tasks

#### 1.1 Add better-sqlite3 dependency
**File:** `packages/dashboard/package.json`
```bash
pnpm --filter @kube-agents/dashboard add better-sqlite3
pnpm --filter @kube-agents/dashboard add -D @types/better-sqlite3
```

#### 1.2 Create new trace schemas in core
**File:** `packages/core/src/schemas/trace.ts`

Replace existing schemas with LangSmith-aligned hierarchy:

```typescript
// Project — groups traces by agent or agent group
ProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),                    // e.g., agent name or group name
  description: z.string().optional(),
  metadata: z.record(z.string()).default({}),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

// Trace — one end-to-end operation (email processing cycle or conversation)
TraceSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string(),                    // e.g., "handle-email" or email subject
  sessionId: z.string().optional(),    // for multi-turn grouping (threadId)
  status: z.enum(['running', 'completed', 'error']),
  inputs: z.record(z.unknown()).optional(),   // email content
  outputs: z.record(z.unknown()).optional(),  // final response
  error: z.string().optional(),
  metadata: z.record(z.string()).default({}),
  tags: z.array(z.string()).default([]),
  startedAt: z.coerce.date(),
  completedAt: z.coerce.date().optional(),
  totalLatencyMs: z.number().optional(),
  totalTokens: z.number().int().default(0),
  promptTokens: z.number().int().default(0),
  completionTokens: z.number().int().default(0),
  cost: z.number().optional(),         // estimated cost in USD
})

// Run — individual execution unit (LLM call, tool call, chain step)
// Replaces old TraceSpan — now supports nesting via parentRunId
RunSchema = z.object({
  id: z.string().uuid(),
  traceId: z.string().uuid(),
  parentRunId: z.string().uuid().optional(),  // enables nesting
  name: z.string(),                    // tool name, "llm-call", etc.
  runType: z.enum(['llm', 'tool', 'chain', 'retriever', 'agent']),
  status: z.enum(['running', 'completed', 'error']),
  inputs: z.record(z.unknown()).optional(),
  outputs: z.record(z.unknown()).optional(),
  error: z.string().optional(),
  metadata: z.record(z.string()).default({}),
  tags: z.array(z.string()).default([]),
  startedAt: z.coerce.date(),
  completedAt: z.coerce.date().optional(),
  latencyMs: z.number().optional(),
  // LLM-specific fields (populated when runType === 'llm')
  promptTokens: z.number().int().optional(),
  completionTokens: z.number().int().optional(),
  totalTokens: z.number().int().optional(),
  model: z.string().optional(),
  provider: z.string().optional(),
  temperature: z.number().optional(),
  // LLM I/O detail
  promptMessages: z.array(LLMMessageSchema).optional(),
  completion: z.string().optional(),
  finishReason: z.string().optional(),
  toolCalls: z.array(z.object({
    id: z.string(),
    name: z.string(),
    arguments: z.string(),
  })).default([]),
})

// Feedback — scores attached to runs or traces
FeedbackSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid().optional(),
  traceId: z.string().uuid(),
  key: z.string(),                     // metric name: "correctness", "helpfulness"
  score: z.number().optional(),        // numeric score (0-1)
  value: z.string().optional(),        // categorical value
  comment: z.string().optional(),      // evaluator reasoning
  source: z.enum(['human', 'code', 'llm']),  // who produced this
  createdAt: z.coerce.date(),
})

// Dataset — collection of test examples
DatasetSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().optional(),
  metadata: z.record(z.string()).default({}),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

// Example — individual test case in a dataset
ExampleSchema = z.object({
  id: z.string().uuid(),
  datasetId: z.string().uuid(),
  inputs: z.record(z.unknown()),       // the input to evaluate
  expectedOutputs: z.record(z.unknown()).optional(),
  metadata: z.record(z.string()).default({}),
  split: z.string().optional(),        // "train", "test", "validation"
  sourceRunId: z.string().uuid().optional(), // if created from a trace
  createdAt: z.coerce.date(),
})

// Experiment — results of evaluating against a dataset
ExperimentSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  datasetId: z.string().uuid(),
  description: z.string().optional(),
  metadata: z.record(z.string()).default({}), // model, temperature, prompt version
  status: z.enum(['running', 'completed', 'error']),
  createdAt: z.coerce.date(),
  completedAt: z.coerce.date().optional(),
})

// ExperimentResult — per-example result in an experiment
ExperimentResultSchema = z.object({
  id: z.string().uuid(),
  experimentId: z.string().uuid(),
  exampleId: z.string().uuid(),
  traceId: z.string().uuid().optional(),  // link to execution trace
  outputs: z.record(z.unknown()).optional(),
  latencyMs: z.number().optional(),
  totalTokens: z.number().int().optional(),
  error: z.string().optional(),
  createdAt: z.coerce.date(),
})
```

#### 1.3 Create SQLite storage layer
**New file:** `packages/dashboard/src/server/db.ts`

```typescript
// Schema migration with CREATE TABLE IF NOT EXISTS
// Tables: projects, traces, runs, feedback, datasets, examples, experiments, experiment_results
// WAL mode enabled
// Prepared statements for all CRUD operations
// JSON columns stored as TEXT (serialize/deserialize in app layer)
```

**Key tables:**
```sql
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
CREATE INDEX IF NOT EXISTS idx_traces_started ON traces(started_at);

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
CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at);

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
```

#### 1.4 Migrate NATS consumer to write to SQLite
**File:** `packages/dashboard/src/server/nats-client.ts`

The NATS consumer currently routes `trace.run.*` and `trace.span.*` messages to in-memory maps. Update to:
1. Auto-create project for each new agentName (upsert by name)
2. Map incoming `TraceRun` → create/update `traces` table row
3. Map incoming `TraceSpan` → insert into `runs` table row
4. Keep backward compatibility with the old event format during transition

#### 1.5 Update API routes to query SQLite
**File:** `packages/dashboard/src/server/routes.ts`

Replace `listRuns()`, `getRun()`, `getSpans()` calls with SQLite queries. Add new endpoints:
- `GET /api/projects` — list projects with trace counts
- `GET /api/projects/:id/traces` — traces for a project
- `GET /api/traces/:traceId/runs` — runs (replaces spans endpoint)
- `GET /api/feedback` — list feedback with filters
- `POST /api/feedback` — create feedback on a run/trace

#### 1.6 Update Dockerfile for native module
**File:** `packages/dashboard/Dockerfile`

Add build dependencies for better-sqlite3:
```dockerfile
RUN apk add --no-cache python3 make g++
```

Add PersistentVolumeClaim mount for SQLite data directory.

### Verification
- [ ] `pnpm build` succeeds with new schemas
- [ ] Dashboard starts and creates SQLite tables
- [ ] NATS consumer writes traces to SQLite
- [ ] API endpoints return data from SQLite
- [ ] Old traces page still works with new data source
- [ ] Docker image builds successfully with native module

---

## Phase 2: Enhanced Tracing & Runtime

### Objective
Update the runtime tracer to emit the new schema format. Add nested runs, metadata, tags, thread grouping, and cross-agent context propagation.

### Tasks

#### 2.1 Rewrite Tracer to emit new schema
**File:** `packages/runtime/src/tracer.ts`

Replace `RunContext` with `TraceContext`:

```typescript
class TraceContext {
  // Creates a Trace (top-level) and returns context for adding child runs
  startTrace(projectName, name, inputs, sessionId?, metadata?, tags?): TraceHandle

  // TraceHandle allows:
  startRun(name, runType, inputs?, parentRunId?): RunHandle
  complete(outputs?)
  fail(error)
}

class RunHandle {
  // For LLM runs: set completion data
  setLLMResult(promptMessages, completion, usage, toolCalls, finishReason, model, provider, temperature)
  // For tool runs: set result
  setToolResult(result, isError)
  // Generic completion
  complete(outputs?)
  fail(error)
  // Nested child run
  startChildRun(name, runType, inputs?): RunHandle
}
```

#### 2.2 Update agent-loop.ts instrumentation
**File:** `packages/runtime/src/agent-loop.ts`

Update `handleEmail()` to use new TraceContext:
1. Create a Trace per email processing cycle
2. Each LLM iteration → `llm` type Run
3. Each tool execution → `tool` type Run (child of LLM run)
4. Pass email content as trace inputs, final response as trace outputs
5. Set metadata: `{ agentEmail, emailId }`, tags: agent groups

#### 2.3 Add trace context to email headers
**File:** `packages/mail/src/` (email schema)

Add optional `traceContext` field to Email schema:
```typescript
traceContext?: {
  traceId: string
  parentRunId?: string
  projectId?: string
}
```

When an agent sends an email in response to processing, embed the current trace context. The receiving agent can then link its trace as a child or related trace.

#### 2.4 Update NATS subjects for new schema
**File:** `packages/core/src/constants.ts`

Update subjects to differentiate trace vs run events:
```typescript
NATS_SUBJECTS = {
  // ... existing mail subjects
  trace: (projectName: string) => `trace.trace.${projectName}`,
  run: (projectName: string) => `trace.run.${projectName}`,
}
```

### Verification
- [ ] Runtime emits new-format trace and run events
- [ ] Dashboard consumer ingests new format into SQLite
- [ ] Nested runs visible in trace detail view
- [ ] Thread grouping works via sessionId
- [ ] Cross-agent trace linking via email headers
- [ ] `pnpm test` passes

---

## Phase 3: Evaluation System

### Objective
Build dataset management, evaluators, and experiment execution — the core feedback loop for agent quality.

### Tasks

#### 3.1 Dataset & Example CRUD API
**File:** `packages/dashboard/src/server/routes.ts`

```
POST   /api/datasets              — create dataset
GET    /api/datasets              — list datasets
GET    /api/datasets/:id          — get dataset with example count
PUT    /api/datasets/:id          — update dataset
DELETE /api/datasets/:id          — delete dataset + cascade examples

POST   /api/datasets/:id/examples — add example(s) (batch support)
GET    /api/datasets/:id/examples — list examples (with split filter)
PUT    /api/examples/:id          — update example
DELETE /api/examples/:id          — delete example

POST   /api/traces/:traceId/to-example — create example from trace
```

#### 3.2 Evaluator framework
**New file:** `packages/core/src/schemas/evaluator.ts`

```typescript
// Evaluator definition
EvaluatorSchema = z.object({
  name: z.string(),
  type: z.enum(['code', 'llm']),
  description: z.string().optional(),
  config: z.record(z.unknown()).default({}),
})

// Code evaluator types: exact_match, contains, json_schema, regex, custom_function
// LLM evaluator types: criteria (reference-free), correctness (reference-based)
```

**New file:** `packages/dashboard/src/server/evaluators/`
```
evaluators/
  index.ts          — evaluator registry and runner
  code-evaluators.ts — exact_match, contains, json_schema, regex
  llm-evaluators.ts  — criteria-based LLM-as-judge
```

Code evaluators run synchronously. LLM evaluators call the LLM provider with a scoring prompt.

#### 3.3 Experiment execution engine
**New file:** `packages/dashboard/src/server/experiment-runner.ts`

```typescript
async function runExperiment(config: {
  name: string
  datasetId: string
  agentName: string      // which agent to test
  agentNamespace: string
  evaluators: Evaluator[]
  metadata?: Record<string, string>
}): Promise<Experiment>
```

Execution flow:
1. Create Experiment record (status: running)
2. For each Example in dataset:
   a. Send email to agent with example inputs
   b. Wait for agent response (poll traces for completion)
   c. Create ExperimentResult with outputs
   d. Run each evaluator → create Feedback records
3. Mark experiment completed

#### 3.4 Feedback API
**File:** `packages/dashboard/src/server/routes.ts`

```
POST   /api/feedback                    — create feedback (human annotation)
GET    /api/traces/:traceId/feedback    — get feedback for a trace
GET    /api/runs/:runId/feedback        — get feedback for a run
DELETE /api/feedback/:id                — delete feedback
```

#### 3.5 Experiment API & comparison
**File:** `packages/dashboard/src/server/routes.ts`

```
POST   /api/experiments           — create & run experiment
GET    /api/experiments           — list experiments
GET    /api/experiments/:id       — get experiment + results + feedback
GET    /api/experiments/compare   — compare 2+ experiments side-by-side
DELETE /api/experiments/:id       — delete experiment
```

### Verification
- [ ] Can create datasets and add examples via API
- [ ] Can create examples from existing traces
- [ ] Code evaluators produce correct feedback scores
- [ ] LLM evaluators call LLM and produce scored feedback
- [ ] Experiments run end-to-end: dataset → agent → results → scores
- [ ] Experiment comparison returns delta data
- [ ] `pnpm test` passes

---

## Phase 4: Monitoring & Aggregate Metrics

### Objective
Add time-series aggregate metrics, monitoring dashboards, and alerting.

### Tasks

#### 4.1 Metrics aggregation queries
**New file:** `packages/dashboard/src/server/metrics.ts`

SQLite aggregate queries for:
- Trace count over time (by hour/day)
- Average latency over time
- Token usage over time (prompt, completion, total)
- Error rate over time
- Cost over time
- Per-model breakdown
- Per-agent breakdown
- Feedback score averages over time

```typescript
function getMetrics(options: {
  projectId?: string
  agentName?: string
  model?: string
  timeRange: { start: Date, end: Date }
  granularity: 'hour' | 'day' | 'week'
}): TimeSeriesMetrics
```

#### 4.2 Metrics API endpoints
**File:** `packages/dashboard/src/server/routes.ts`

```
GET /api/metrics/traces      — trace count, latency, error rate time series
GET /api/metrics/tokens       — token usage time series
GET /api/metrics/models       — per-model breakdown
GET /api/metrics/feedback     — feedback score trends
GET /api/metrics/cost         — cost time series
```

#### 4.3 Online evaluation rules
**New file:** `packages/dashboard/src/server/automation.ts`

```typescript
AutomationRuleSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  projectId: z.string().uuid().optional(),
  filter: z.object({
    agentName: z.string().optional(),
    status: z.enum(['completed', 'error']).optional(),
    tags: z.array(z.string()).optional(),
    metadata: z.record(z.string()).optional(),
  }),
  samplingRate: z.number().min(0).max(1).default(1),
  action: z.discriminatedUnion('type', [
    z.object({ type: z.literal('evaluate'), evaluators: z.array(EvaluatorSchema) }),
    z.object({ type: z.literal('add_to_dataset'), datasetId: z.string().uuid() }),
    z.object({ type: z.literal('webhook'), url: z.string().url(), headers: z.record(z.string()).default({}) }),
  ]),
  enabled: z.boolean().default(true),
  createdAt: z.coerce.date(),
})
```

Hook into NATS consumer: when a trace completes, check automation rules and execute matching actions.

### Verification
- [ ] Metrics queries return correct aggregated data
- [ ] Time-series data respects granularity and time range
- [ ] Automation rules trigger on matching traces
- [ ] Online evaluators produce feedback on production traces
- [ ] `pnpm test` passes

---

## Phase 5: Dashboard UI Restructure

### Objective
Restructure the dashboard navigation and add new pages for evaluation, monitoring, and experiments.

### Tasks

#### 5.1 New navigation structure
**File:** `packages/dashboard/src/client/App.tsx`

New routes:
```
#/                              → OverviewPage (system health)
#/projects                      → ProjectsPage (list projects with stats)
#/projects/:id                  → ProjectDetailPage (traces for project)
#/traces                        → TracesPage (global trace search)
#/traces/:traceId               → TraceDetailPage (hierarchical run tree)
#/evaluation/datasets           → DatasetsPage
#/evaluation/datasets/:id       → DatasetDetailPage (examples list)
#/evaluation/experiments        → ExperimentsPage
#/evaluation/experiments/:id    → ExperimentDetailPage (results + feedback)
#/evaluation/compare            → ExperimentComparePage
#/monitoring                    → MonitoringPage (time-series charts)
#/agents/:namespace/:name       → AgentDetailPage (existing, enhanced)
```

#### 5.2 Updated Header with navigation
**File:** `packages/dashboard/src/client/components/header.tsx`

Navigation tabs: Overview | Projects | Traces | Evaluation | Monitoring | Agents

Evaluation sub-menu: Datasets | Experiments

#### 5.3 New pages

**ProjectsPage** — List projects with: trace count, avg latency, error rate, last activity
**ProjectDetailPage** — Traces table scoped to project, project-level metrics

**TraceDetailPage (enhanced)** — Hierarchical run tree (nested runs, not flat timeline), feedback display, "Add to dataset" button

**DatasetsPage** — List datasets with example count, create new dataset
**DatasetDetailPage** — Examples table, add/edit/delete examples, split filtering, run experiment button

**ExperimentsPage** — List experiments with status, scores, compare checkbox
**ExperimentDetailPage** — Per-example results table with evaluator scores, trace links
**ExperimentComparePage** — Side-by-side results, color-coded score deltas, baseline selection

**MonitoringPage** — Time-series charts (trace volume, latency, tokens, errors, cost), agent/model breakdown, feedback trends. Use simple SVG or canvas charts (no heavy charting library needed initially).

#### 5.4 New components

**RunTree** — Hierarchical tree view replacing SpanTimeline. Shows nested parent-child runs with expand/collapse, indentation, type icons (LLM/tool/chain).

**FeedbackDisplay** — Shows scores, values, comments attached to runs/traces. Allows adding human feedback inline.

**DatasetTable** — Examples table with inputs/outputs preview, split badges, bulk actions.

**ExperimentResultsTable** — Per-example results with evaluator score columns, pass/fail indicators, trace links.

**MetricsChart** — Simple time-series chart component (SVG-based). Supports line and bar chart modes.

**ComparisonView** — Side-by-side experiment outputs with diff highlighting and score deltas.

### Verification
- [ ] All new routes render correctly
- [ ] Navigation works across all pages
- [ ] Projects page lists projects with correct stats
- [ ] Trace detail shows nested run tree
- [ ] Dataset CRUD works end-to-end in UI
- [ ] Experiment results display with scores
- [ ] Experiment comparison shows deltas
- [ ] Monitoring charts render time-series data
- [ ] Responsive layout works
- [ ] `pnpm build` succeeds (client + server)

---

## Phase 6: Runtime Backward Compatibility & Migration

### Objective
Ensure smooth transition from old trace format to new, and handle data migration.

### Tasks

#### 6.1 Dual-format NATS consumer
The dashboard NATS consumer should handle both old-format (`TraceRun`/`TraceSpan`) and new-format (`Trace`/`Run`) events during transition. Detect format by checking for discriminating fields (`runType` exists → new format).

#### 6.2 Old trace-store.ts deprecation
Keep `trace-store.ts` as fallback for the first release, gate behind `STORAGE_BACKEND=memory|sqlite` env var (default: sqlite). Remove in subsequent release.

#### 6.3 Helm chart updates
**File:** `deploy/helm/kube-agents/templates/dashboard-deployment.yaml`

- Add PVC for SQLite data (`/data/kube-agents.db`)
- Add `STORAGE_BACKEND` env var
- Add `DATABASE_PATH` env var

### Verification
- [ ] Old-format trace events still ingested correctly
- [ ] New-format trace events ingested correctly
- [ ] SQLite file persists across pod restarts
- [ ] Helm upgrade works without data loss
- [ ] `pnpm test` passes

---

## Execution Order

1. **Phase 1** (Storage + Data Model) — foundation, everything depends on this
2. **Phase 2** (Enhanced Tracing) — runtime changes to emit new format
3. **Phase 6** (Backward Compat) — can run alongside Phase 2
4. **Phase 5** (UI Restructure) — can start navigation/routing in parallel with Phase 3
5. **Phase 3** (Evaluation) — datasets, evaluators, experiments
6. **Phase 4** (Monitoring) — aggregate metrics, automation rules

Phases 3-5 can be developed in parallel by different contexts since they touch different files.

---

## Key Design Decisions

1. **SQLite over PostgreSQL** — Single-pod dashboard, no need for distributed DB. SQLite with WAL mode handles concurrent reads well. PVC provides persistence.

2. **Rename Span → Run** — Aligns with LangSmith terminology. A "Run" is the fundamental unit of work (LLM call, tool call, chain). Supports nesting via parentRunId.

3. **Project as auto-created entity** — Projects are created automatically when an agent first emits a trace. No manual project management needed.

4. **Evaluation via email** — Experiments send test inputs as emails to agents (using existing messaging infrastructure), then capture the trace. This reuses the agent's natural execution path.

5. **No external charting library** — Simple SVG charts for monitoring. Keeps bundle small and avoids dependency on heavy visualization libraries.

6. **JSON in TEXT columns** — SQLite stores metadata, tags, inputs, outputs as JSON strings in TEXT columns. Parsed in the application layer. SQLite's JSON functions available for complex queries if needed.
