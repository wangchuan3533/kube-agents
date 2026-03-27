export const API_GROUP = 'agents.kube-agents.io';
export const API_VERSION = 'v1alpha1';
export const FULL_API_VERSION = `${API_GROUP}/${API_VERSION}`;

export const CRD_KINDS = {
  AGENT: 'Agent',
  AGENT_GROUP: 'AgentGroup',
} as const;

export const NATS_SUBJECTS = {
  directMail: (email: string) => `mail.${email.replace('@', '.')}`,
  groupMail: (groupEmail: string) => `mail.group.${groupEmail.replace('@', '.')}`,
  deadLetter: 'mail.dead-letter',
  traceRun: (agentName: string) => `trace.run.${agentName}`,
  traceSpan: (agentName: string) => `trace.span.${agentName}`,
} as const;

export const LABELS = {
  MANAGED_BY: `${API_GROUP}/managed-by`,
  AGENT_NAME: `${API_GROUP}/agent-name`,
  AGENT_EMAIL: `${API_GROUP}/agent-email`,
} as const;

export const STREAM_NAME = 'KUBE_AGENTS_MAIL';
export const TRACE_STREAM_NAME = 'KUBE_AGENTS_TRACES';
export const TRACE_STREAM_SUBJECTS = ['trace.>'];
