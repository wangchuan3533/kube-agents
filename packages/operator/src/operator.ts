import * as k8s from '@kubernetes/client-node';
import { AgentController } from './controllers/agent-controller.js';
import { AgentGroupController } from './controllers/agent-group-controller.js';

export interface OperatorOptions {
  namespace?: string;
  kubeConfigPath?: string;
}

export class AgentOperator {
  private readonly kc: k8s.KubeConfig;
  private readonly agentController: AgentController;
  private readonly groupController: AgentGroupController;

  constructor(options: OperatorOptions = {}) {
    this.kc = new k8s.KubeConfig();

    if (options.kubeConfigPath) {
      this.kc.loadFromFile(options.kubeConfigPath);
    } else {
      this.kc.loadFromDefault();
    }

    this.agentController = new AgentController(this.kc, options.namespace);
    this.groupController = new AgentGroupController(this.kc, options.namespace);
  }

  async start(): Promise<void> {
    console.log('[Operator] Starting kube-agents operator...');
    await Promise.all([
      this.agentController.start(),
      this.groupController.start(),
    ]);
    console.log('[Operator] Operator is running.');
  }

  stop(): void {
    console.log('[Operator] Stopping operator...');
    this.agentController.stop();
    this.groupController.stop();
    console.log('[Operator] Operator stopped.');
  }
}
