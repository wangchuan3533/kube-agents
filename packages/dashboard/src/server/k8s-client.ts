import * as k8s from '@kubernetes/client-node';

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const K8S_CONTEXT = process.env['K8S_CONTEXT'] ?? 'k8s-local2';
const contextObj = kc.getContexts().find((ctx) => ctx.name === K8S_CONTEXT);
if (contextObj) {
  kc.setCurrentContext(K8S_CONTEXT);
}

const customApi = kc.makeApiClient(k8s.CustomObjectsApi);

const GROUP = 'agents.kube-agents.io';
const VERSION = 'v1alpha1';

export interface K8sAgent {
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

export interface K8sAgentGroup {
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

export async function listAgents(namespace: string): Promise<K8sAgent[]> {
  const response = await customApi.listNamespacedCustomObject({
    group: GROUP,
    version: VERSION,
    namespace,
    plural: 'agents',
  });
  const body = response as { items?: K8sAgent[] };
  return body.items ?? [];
}

export async function listAgentGroups(namespace: string): Promise<K8sAgentGroup[]> {
  const response = await customApi.listNamespacedCustomObject({
    group: GROUP,
    version: VERSION,
    namespace,
    plural: 'agentgroups',
  });
  const body = response as { items?: K8sAgentGroup[] };
  return body.items ?? [];
}
