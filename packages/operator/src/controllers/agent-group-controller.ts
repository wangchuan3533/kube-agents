import * as k8s from '@kubernetes/client-node';
import { AgentGroupSpecSchema } from '@kube-agents/core';
import { CRDWatcher, type WatchEvent } from '../crd-watcher.js';

export class AgentGroupController {
  private readonly watcher: CRDWatcher<k8s.KubernetesObject & { spec?: unknown }>;
  private readonly groups = new Map<string, { email: string; members: string[] }>();

  constructor(kc: k8s.KubeConfig, namespace?: string) {
    this.watcher = new CRDWatcher({
      kc,
      group: 'agents.kube-agents.io',
      version: 'v1alpha1',
      plural: 'agentgroups',
      namespace,
    });
  }

  async start(): Promise<void> {
    console.log('[AgentGroupController] Starting watch on AgentGroup resources...');
    await this.watcher.watch(async (event) => {
      await this.handleEvent(event);
    });
  }

  stop(): void {
    this.watcher.stop();
  }

  getGroup(name: string): { email: string; members: string[] } | undefined {
    return this.groups.get(name);
  }

  getGroupByEmail(email: string): { email: string; members: string[] } | undefined {
    for (const group of this.groups.values()) {
      if (group.email === email) return group;
    }
    return undefined;
  }

  listGroups(): Map<string, { email: string; members: string[] }> {
    return new Map(this.groups);
  }

  private async handleEvent(
    event: WatchEvent<k8s.KubernetesObject & { spec?: unknown }>,
  ): Promise<void> {
    const name = event.object.metadata?.name;
    if (!name) return;

    console.log(`[AgentGroupController] ${event.type}: ${name}`);

    switch (event.type) {
      case 'ADDED':
      case 'MODIFIED': {
        const parseResult = AgentGroupSpecSchema.safeParse(event.object.spec);
        if (!parseResult.success) {
          console.error(
            `[AgentGroupController] Invalid spec for group ${name}:`,
            parseResult.error.message,
          );
          return;
        }
        this.groups.set(name, {
          email: parseResult.data.email,
          members: parseResult.data.members,
        });
        break;
      }
      case 'DELETED':
        this.groups.delete(name);
        break;
    }
  }
}
