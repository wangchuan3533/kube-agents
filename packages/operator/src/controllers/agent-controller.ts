import * as k8s from '@kubernetes/client-node';
import { AgentSpecSchema } from '@kube-agents/core';
import { CRDWatcher, type WatchEvent } from '../crd-watcher.js';
import { PodManager } from '../pod-manager.js';

export class AgentController {
  private readonly watcher: CRDWatcher<k8s.KubernetesObject & { spec?: unknown }>;
  private readonly podManager: PodManager;

  constructor(kc: k8s.KubeConfig, namespace?: string) {
    this.watcher = new CRDWatcher({
      kc,
      group: 'agents.kube-agents.io',
      version: 'v1alpha1',
      plural: 'agents',
      namespace,
    });
    this.podManager = new PodManager(kc, namespace);
  }

  async start(): Promise<void> {
    console.log('[AgentController] Starting watch on Agent resources...');
    await this.watcher.watch(async (event) => {
      await this.handleEvent(event);
    });
  }

  stop(): void {
    this.watcher.stop();
  }

  private async handleEvent(
    event: WatchEvent<k8s.KubernetesObject & { spec?: unknown }>,
  ): Promise<void> {
    const name = event.object.metadata?.name;
    if (!name) return;

    console.log(`[AgentController] ${event.type}: ${name}`);

    switch (event.type) {
      case 'ADDED':
      case 'MODIFIED': {
        const parseResult = AgentSpecSchema.safeParse(event.object.spec);
        if (!parseResult.success) {
          console.error(
            `[AgentController] Invalid spec for agent ${name}:`,
            parseResult.error.message,
          );
          return;
        }
        await this.podManager.ensurePod(name, parseResult.data);
        break;
      }
      case 'DELETED':
        await this.podManager.deletePod(name);
        break;
    }
  }
}
