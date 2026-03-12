import * as k8s from '@kubernetes/client-node';
import { OperatorError } from '@kube-agents/core';

export interface WatchEvent<T> {
  type: 'ADDED' | 'MODIFIED' | 'DELETED';
  object: T;
}

export type WatchHandler<T> = (event: WatchEvent<T>) => Promise<void>;

export class CRDWatcher<T extends k8s.KubernetesObject> {
  private readonly kc: k8s.KubeConfig;
  private readonly group: string;
  private readonly version: string;
  private readonly plural: string;
  private readonly namespace: string;
  private request: { abort: () => void } | undefined;

  constructor(options: {
    kc: k8s.KubeConfig;
    group: string;
    version: string;
    plural: string;
    namespace?: string;
  }) {
    this.kc = options.kc;
    this.group = options.group;
    this.version = options.version;
    this.plural = options.plural;
    this.namespace = options.namespace ?? 'default';
  }

  async watch(handler: WatchHandler<T>): Promise<void> {
    const watch = new k8s.Watch(this.kc);
    const path = `/apis/${this.group}/${this.version}/namespaces/${this.namespace}/${this.plural}`;

    try {
      this.request = await watch.watch(
        path,
        {},
        (type: string, apiObj: T) => {
          handler({
            type: type as WatchEvent<T>['type'],
            object: apiObj,
          }).catch((err) => {
            console.error(`[CRDWatcher] Error handling ${type} event:`, err);
          });
        },
        (err) => {
          if (err) {
            console.error(`[CRDWatcher] Watch error on ${path}:`, err);
            // Reconnect after a delay
            setTimeout(() => {
              this.watch(handler).catch(console.error);
            }, 5000);
          }
        },
      );
    } catch (err) {
      throw new OperatorError(
        `Failed to watch ${path}: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  stop(): void {
    this.request?.abort();
  }
}
