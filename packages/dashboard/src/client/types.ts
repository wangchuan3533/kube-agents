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
