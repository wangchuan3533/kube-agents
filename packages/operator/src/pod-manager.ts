import * as k8s from '@kubernetes/client-node';
import { type AgentSpec, LABELS, FULL_API_VERSION } from '@kube-agents/core';

const RUNTIME_IMAGE = 'kube-agents/runtime:latest';

export class PodManager {
  private readonly coreApi: k8s.CoreV1Api;
  private readonly namespace: string;

  constructor(kc: k8s.KubeConfig, namespace = 'default') {
    this.coreApi = kc.makeApiClient(k8s.CoreV1Api);
    this.namespace = namespace;
  }

  async ensurePod(agentName: string, spec: AgentSpec): Promise<void> {
    const podName = `agent-${agentName}`;

    try {
      await this.coreApi.readNamespacedPod({ name: podName, namespace: this.namespace });
      // Pod exists — update ConfigMap and restart if spec changed
      await this.updateConfigMap(agentName, spec);
    } catch {
      // Pod doesn't exist — create it
      await this.createConfigMap(agentName, spec);
      await this.createPod(agentName, spec);
    }
  }

  async deletePod(agentName: string): Promise<void> {
    const podName = `agent-${agentName}`;

    try {
      await this.coreApi.deleteNamespacedPod({ name: podName, namespace: this.namespace });
    } catch {
      // Pod already gone
    }

    try {
      await this.coreApi.deleteNamespacedConfigMap({
        name: `agent-config-${agentName}`,
        namespace: this.namespace,
      });
    } catch {
      // ConfigMap already gone
    }
  }

  private async createConfigMap(agentName: string, spec: AgentSpec): Promise<void> {
    const configMap: k8s.V1ConfigMap = {
      metadata: {
        name: `agent-config-${agentName}`,
        namespace: this.namespace,
        labels: {
          [LABELS.MANAGED_BY]: 'kube-agents-operator',
          [LABELS.AGENT_NAME]: agentName,
        },
      },
      data: {
        'agent-spec.json': JSON.stringify(spec),
      },
    };

    await this.coreApi.createNamespacedConfigMap({
      namespace: this.namespace,
      body: configMap,
    });
  }

  private async updateConfigMap(agentName: string, spec: AgentSpec): Promise<void> {
    const configMap: k8s.V1ConfigMap = {
      metadata: {
        name: `agent-config-${agentName}`,
        namespace: this.namespace,
      },
      data: {
        'agent-spec.json': JSON.stringify(spec),
      },
    };

    await this.coreApi.replaceNamespacedConfigMap({
      name: `agent-config-${agentName}`,
      namespace: this.namespace,
      body: configMap,
    });
  }

  private async createPod(agentName: string, spec: AgentSpec): Promise<void> {
    const pod: k8s.V1Pod = {
      metadata: {
        name: `agent-${agentName}`,
        namespace: this.namespace,
        labels: {
          [LABELS.MANAGED_BY]: 'kube-agents-operator',
          [LABELS.AGENT_NAME]: agentName,
          [LABELS.AGENT_EMAIL]: spec.identity.email,
        },
        annotations: {
          'agents.kube-agents.io/api-version': FULL_API_VERSION,
        },
      },
      spec: {
        containers: [
          {
            name: 'agent-runtime',
            image: RUNTIME_IMAGE,
            env: [
              {
                name: 'AGENT_CONFIG_PATH',
                value: '/etc/agent/agent-spec.json',
              },
              {
                name: 'NATS_URL',
                value: process.env['NATS_URL'] ?? 'nats://nats:4222',
              },
            ],
            volumeMounts: [
              {
                name: 'agent-config',
                mountPath: '/etc/agent',
                readOnly: true,
              },
            ],
            resources: {
              requests: {
                cpu: spec.resources.cpu,
                memory: spec.resources.memory,
              },
              limits: {
                cpu: spec.resources.cpu,
                memory: spec.resources.memory,
              },
            },
            livenessProbe: {
              httpGet: { path: '/healthz', port: 8080 } as unknown as k8s.V1HTTPGetAction,
              initialDelaySeconds: 10,
              periodSeconds: 30,
            },
          },
        ],
        volumes: [
          {
            name: 'agent-config',
            configMap: {
              name: `agent-config-${agentName}`,
            },
          },
        ],
        restartPolicy: 'Always',
      },
    };

    await this.coreApi.createNamespacedPod({
      namespace: this.namespace,
      body: pod,
    });
  }
}
