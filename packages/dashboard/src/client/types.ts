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

// Trace types

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

export interface TraceListResponse {
  runs: TraceRun[];
  total: number;
  hasMore: boolean;
}

export interface TraceDetailResponse {
  run: TraceRun;
  spans: TraceSpan[];
}
