export interface AgentData {
  metadata: { name: string; namespace: string; creationTimestamp: string };
  spec: {
    identity: { name: string; email: string; groups?: string[] };
    llm: { provider: string; model: string };
    replicas: number;
  };
  status?: {
    phase: string;
    message?: string;
    readyReplicas: number;
    messagesReceived: number;
    messagesSent: number;
    totalTokensUsed: number;
    promptTokens: number;
    completionTokens: number;
    lastActiveAt?: string;
  };
}

export interface AgentDetailData {
  metadata: { name: string; namespace: string; creationTimestamp: string };
  spec: {
    identity: { name: string; email: string; groups?: string[] };
    llm: { provider: string; model: string; temperature?: number; maxTokens?: number };
    system?: string;
    tools?: Array<{ name: string; config?: Record<string, unknown> }>;
    skills?: Array<{ name: string; config?: Record<string, unknown> }>;
    permissions?: {
      filesystem?: { read?: string[]; write?: string[] };
      network?: { allowedHosts?: string[]; deniedHosts?: string[] };
      tools?: string[];
      maxConcurrentToolCalls?: number;
    };
    resources?: { cpu?: string; memory?: string };
    replicas: number;
  };
  status?: {
    phase: string;
    message?: string;
    readyReplicas: number;
    messagesReceived: number;
    messagesSent: number;
    totalTokensUsed: number;
    promptTokens: number;
    completionTokens: number;
    lastActiveAt?: string;
  };
}

export interface EmailMessage {
  id: string;
  from: string;
  to: string[];
  subject: string;
  body: string;
  inReplyTo?: string;
  threadId?: string;
  attachments?: Array<{ filename: string; contentType: string; data: string }>;
  timestamp: string;
}

export interface MessageListResponse {
  messages: EmailMessage[];
  hasMore: boolean;
}

export interface ThreadResponse {
  messages: EmailMessage[];
}

export interface AgentGroupData {
  metadata: { name: string; namespace: string; creationTimestamp: string };
  spec: {
    email: string;
    members: string[];
    description?: string;
  };
  status?: {
    memberCount: number;
    readyMembers: number;
  };
}

export interface OverviewData {
  agents: AgentData[];
  groups: AgentGroupData[];
}

// ---------------------------------------------------------------------------
// New observability types (LangSmith-aligned)
// ---------------------------------------------------------------------------

export interface ProjectData {
  id: string;
  name: string;
  description?: string;
  metadata: Record<string, string>;
  createdAt: string;
  updatedAt: string;
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

export interface ProjectsResponse {
  projects: ProjectData[];
  stats: ProjectStats[];
}

export interface TraceData {
  id: string;
  projectId: string;
  name: string;
  sessionId?: string;
  status: 'running' | 'completed' | 'error';
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  error?: string;
  metadata: Record<string, string>;
  tags: string[];
  startedAt: string;
  completedAt?: string;
  totalLatencyMs?: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  cost?: number;
}

export interface RunData {
  id: string;
  traceId: string;
  parentRunId?: string;
  name: string;
  runType: 'llm' | 'tool' | 'chain' | 'retriever' | 'agent';
  status: 'running' | 'completed' | 'error';
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  error?: string;
  metadata: Record<string, string>;
  tags: string[];
  startedAt: string;
  completedAt?: string;
  latencyMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  model?: string;
  provider?: string;
  temperature?: number;
  promptMessages?: Array<{
    role: string;
    content: string;
    toolCallId?: string;
    toolCalls?: Array<{ id: string; name: string; arguments: string }>;
  }>;
  completion?: string;
  finishReason?: string;
  toolCalls: Array<{ id: string; name: string; arguments: string }>;
}

export interface FeedbackData {
  id: string;
  runId?: string;
  traceId: string;
  key: string;
  score?: number;
  value?: string;
  comment?: string;
  source: 'human' | 'code' | 'llm';
  createdAt: string;
}

export interface TraceListResponse {
  traces: TraceData[];
  total: number;
  hasMore: boolean;
}

export interface TraceDetailResponse {
  trace: TraceData;
  runs: RunData[];
  feedback: FeedbackData[];
}

// ---------------------------------------------------------------------------
// Evaluation types
// ---------------------------------------------------------------------------

export interface DatasetData {
  id: string;
  name: string;
  description?: string;
  metadata: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface ExampleData {
  id: string;
  datasetId: string;
  inputs: Record<string, unknown>;
  expectedOutputs?: Record<string, unknown>;
  metadata: Record<string, string>;
  split?: string;
  sourceRunId?: string;
  createdAt: string;
}

export interface ExperimentData {
  id: string;
  name: string;
  datasetId: string;
  description?: string;
  metadata: Record<string, string>;
  status: 'running' | 'completed' | 'error';
  createdAt: string;
  completedAt?: string;
}

export interface ExperimentResultData {
  id: string;
  experimentId: string;
  exampleId: string;
  traceId?: string;
  outputs?: Record<string, unknown>;
  latencyMs?: number;
  totalTokens?: number;
  error?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Monitoring types
// ---------------------------------------------------------------------------

export interface TimeSeriesPoint {
  bucket: string;
  traceCount: number;
  errorCount: number;
  avgLatencyMs: number | null;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
}

export interface ModelUsage {
  model: string;
  provider: string;
  callCount: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  avgLatencyMs: number | null;
}

export interface ErrorRate {
  projectId: string;
  projectName: string;
  total: number;
  errors: number;
  rate: number;
}

export interface MonitoringSummary {
  totalTraces: number;
  totalTokens: number;
  totalErrors: number;
  errorRate: number;
  avgLatencyMs: number | null;
  projectCount: number;
}

export interface MonitoringData {
  summary: MonitoringSummary;
  timeseries: TimeSeriesPoint[];
  models: ModelUsage[];
  errors: ErrorRate[];
  projectStats: ProjectStats[];
}

// ---------------------------------------------------------------------------
// Legacy types (kept for backward-compat with existing components)
// ---------------------------------------------------------------------------

export interface TraceRun {
  id: string;
  agentName: string;
  agentEmail: string;
  emailId: string;
  threadId?: string;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'completed' | 'error';
  error?: string;
  totalLatencyMs?: number;
  iterationCount: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
}

export interface TraceLLMSpan {
  provider: string;
  model: string;
  messages: Array<{
    role: string;
    content: string;
    toolCallId?: string;
    toolCalls?: Array<{ id: string; name: string; arguments: string }>;
  }>;
  completion: string;
  toolCalls: Array<{ id: string; name: string; arguments: string }>;
  finishReason: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  temperature?: number;
  iteration: number;
}

export interface TraceToolSpan {
  name: string;
  arguments: string;
  result: string;
  isError: boolean;
  toolCallId: string;
}

export interface TraceSpan {
  id: string;
  runId: string;
  agentName: string;
  type: 'llm_call' | 'tool_call';
  startedAt: string;
  completedAt: string;
  latencyMs: number;
  llm?: TraceLLMSpan;
  tool?: TraceToolSpan;
}
