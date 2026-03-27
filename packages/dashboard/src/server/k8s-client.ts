import * as k8s from '@kubernetes/client-node';

const kc = new k8s.KubeConfig();

// Use in-cluster config when running inside K8s, fall back to default kubeconfig
try {
  kc.loadFromCluster();
  console.log('[k8s-client] Using in-cluster config');
} catch {
  kc.loadFromDefault();
  const K8S_CONTEXT = process.env['K8S_CONTEXT'] ?? '';
  if (K8S_CONTEXT) {
    const contextObj = kc.getContexts().find((ctx) => ctx.name === K8S_CONTEXT);
    if (contextObj) {
      kc.setCurrentContext(K8S_CONTEXT);
    }
  }
  console.log(`[k8s-client] Using kubeconfig context: ${kc.getCurrentContext()}`);
}

const customApi = kc.makeApiClient(k8s.CustomObjectsApi);
const coreApi = kc.makeApiClient(k8s.CoreV1Api);

const GROUP = 'agents.kube-agents.io';
const VERSION = 'v1alpha1';

export interface K8sAgent {
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

/** Get pod status for agent pods managed by the operator. */
async function getAgentPodStatuses(namespace: string): Promise<Map<string, k8s.V1Pod>> {
  try {
    const response = await coreApi.listNamespacedPod({
      namespace,
      labelSelector: `${GROUP}/managed-by=kube-agents-operator`,
    });
    const podMap = new Map<string, k8s.V1Pod>();
    for (const pod of response.items) {
      const agentName = pod.metadata?.labels?.[`${GROUP}/agent-name`];
      if (agentName) {
        podMap.set(agentName, pod);
      }
    }
    return podMap;
  } catch {
    return new Map();
  }
}

/** Derive agent phase from pod status. */
function podPhase(pod: k8s.V1Pod | undefined): string {
  if (!pod) return 'Pending';
  const phase = pod.status?.phase;
  if (phase === 'Running') {
    const ready = pod.status?.containerStatuses?.every((c) => c.ready) ?? false;
    return ready ? 'Running' : 'Starting';
  }
  if (phase === 'Pending') return 'Pending';
  if (phase === 'Failed') return 'Error';
  return phase ?? 'Unknown';
}

export async function listAgents(namespace: string): Promise<K8sAgent[]> {
  const [agentResponse, podStatuses] = await Promise.all([
    customApi.listNamespacedCustomObject({
      group: GROUP,
      version: VERSION,
      namespace,
      plural: 'agents',
    }),
    getAgentPodStatuses(namespace),
  ]);

  const body = agentResponse as { items?: K8sAgent[] };
  const agents = body.items ?? [];

  // Enrich agents with pod status
  return agents.map((agent) => {
    const pod = podStatuses.get(agent.metadata.name);
    const isReady = pod?.status?.containerStatuses?.every((c) => c.ready) ?? false;

    return {
      ...agent,
      status: {
        phase: agent.status?.phase ?? podPhase(pod),
        message: agent.status?.message,
        readyReplicas: agent.status?.readyReplicas ?? (isReady ? 1 : 0),
        messagesReceived: agent.status?.messagesReceived ?? 0,
        messagesSent: agent.status?.messagesSent ?? 0,
        totalTokensUsed: agent.status?.totalTokensUsed ?? 0,
        promptTokens: agent.status?.promptTokens ?? 0,
        completionTokens: agent.status?.completionTokens ?? 0,
        lastActiveAt: agent.status?.lastActiveAt,
      },
    };
  });
}

export async function getAgent(namespace: string, name: string): Promise<K8sAgent | null> {
  try {
    const [agentResponse, podStatuses] = await Promise.all([
      customApi.getNamespacedCustomObject({
        group: GROUP,
        version: VERSION,
        namespace,
        plural: 'agents',
        name,
      }),
      getAgentPodStatuses(namespace),
    ]);

    const agent = agentResponse as K8sAgent;
    const pod = podStatuses.get(agent.metadata.name);
    const isReady = pod?.status?.containerStatuses?.every((c) => c.ready) ?? false;

    return {
      ...agent,
      status: {
        phase: agent.status?.phase ?? podPhase(pod),
        message: agent.status?.message,
        readyReplicas: agent.status?.readyReplicas ?? (isReady ? 1 : 0),
        messagesReceived: agent.status?.messagesReceived ?? 0,
        messagesSent: agent.status?.messagesSent ?? 0,
        totalTokensUsed: agent.status?.totalTokensUsed ?? 0,
        promptTokens: agent.status?.promptTokens ?? 0,
        completionTokens: agent.status?.completionTokens ?? 0,
        lastActiveAt: agent.status?.lastActiveAt,
      },
    };
  } catch {
    return null;
  }
}

export async function listAgentGroups(namespace: string): Promise<K8sAgentGroup[]> {
  const response = await customApi.listNamespacedCustomObject({
    group: GROUP,
    version: VERSION,
    namespace,
    plural: 'agentgroups',
  });
  const body = response as { items?: K8sAgentGroup[] };
  const groups = body.items ?? [];

  // Enrich groups with member count from spec
  return groups.map((group) => ({
    ...group,
    status: {
      memberCount: group.status?.memberCount ?? group.spec.members.length,
      readyMembers: group.status?.readyMembers ?? 0,
    },
  }));
}
