import type { AgentSpec } from '@kube-agents/core';
import { Mailbox, createNatsConnection, type NatsConnectionOptions } from '@kube-agents/mail';
import { createLLMProvider, type LLMProviderInterface } from '@kube-agents/llm';
import { ToolRegistry, BUILT_IN_TOOLS } from '@kube-agents/tools';
import type { RegisteredTool } from '@kube-agents/tools';
import { handleEmail, type AgentLoopDeps } from './agent-loop.js';
import { Tracer } from './tracer.js';

function createSendEmailTool(mailbox: Mailbox, senderEmail: string): RegisteredTool {
  return {
    definition: {
      name: 'send-email',
      description: 'Send an email to another agent. Use this to delegate tasks, request reviews, or communicate with other agents.',
      parameters: {
        to: {
          type: 'string',
          description: 'Recipient email address (e.g. code_agent@agents.mycompany.com)',
          required: true,
        },
        subject: {
          type: 'string',
          description: 'Email subject line',
          required: true,
        },
        body: {
          type: 'string',
          description: 'Email body content with the task or message',
          required: true,
        },
      },
    },
    execute: async (args) => {
      const to = args['to'] as string;
      const subject = args['subject'] as string;
      const body = args['body'] as string;

      const email = await mailbox.send({
        from: senderEmail,
        to: [to],
        subject,
        body,
        attachments: [],
      });

      return `Email sent successfully to ${to} (id: ${email.id})`;
    },
  };
}

export interface AgentOptions {
  spec: AgentSpec;
  nats?: NatsConnectionOptions;
  apiKey?: string;
}

export class Agent {
  private readonly spec: AgentSpec;
  private readonly natsOptions: NatsConnectionOptions;
  private readonly apiKey?: string;
  private mailbox: Mailbox | undefined;
  private llm: LLMProviderInterface | undefined;
  private toolRegistry: ToolRegistry | undefined;
  private tracer: Tracer | undefined;
  private running = false;

  constructor(options: AgentOptions) {
    this.spec = options.spec;
    this.natsOptions = options.nats ?? {};
    this.apiKey = options.apiKey;
  }

  async start(): Promise<void> {
    console.log(`[Agent ${this.spec.identity.name}] Starting...`);

    // Set up LLM provider
    this.llm = createLLMProvider(this.spec.llm, this.apiKey);
    console.log(`[Agent ${this.spec.identity.name}] LLM provider: ${this.llm.name}`);

    // Set up tool registry
    this.toolRegistry = new ToolRegistry();
    for (const tool of BUILT_IN_TOOLS) {
      const isAllowed =
        this.spec.tools.length === 0 ||
        this.spec.tools.some((t) => t.name === tool.definition.name);
      if (isAllowed) {
        this.toolRegistry.register(tool);
      }
    }
    console.log(
      `[Agent ${this.spec.identity.name}] Registered ${this.toolRegistry.list().length} tools`,
    );

    // Connect to NATS and initialize mailbox
    const nc = await createNatsConnection({
      ...this.natsOptions,
      name: `agent-${this.spec.identity.name}`,
    });

    this.mailbox = new Mailbox({ identity: this.spec.identity, nc });
    await this.mailbox.init();
    console.log(`[Agent ${this.spec.identity.name}] Mailbox initialized: ${this.spec.identity.email}`);

    // Initialize tracer for observability
    this.tracer = new Tracer(nc);
    await this.tracer.init();
    console.log(`[Agent ${this.spec.identity.name}] Tracer initialized`);

    // Register the send-email tool (available to all agents for inter-agent communication)
    this.toolRegistry.register(createSendEmailTool(this.mailbox, this.spec.identity.email));

    // Subscribe to incoming emails
    const deps: AgentLoopDeps = {
      spec: this.spec,
      mailbox: this.mailbox,
      llm: this.llm,
      toolRegistry: this.toolRegistry,
      tracer: this.tracer,
    };

    await this.mailbox.subscribe(async (email) => {
      console.log(
        `[Agent ${this.spec.identity.name}] Received email from ${email.from}: ${email.subject}`,
      );
      try {
        await handleEmail(deps, email);
      } catch (err) {
        console.error(`[Agent ${this.spec.identity.name}] Error handling email:`, err);
      }
    });

    this.running = true;
    console.log(`[Agent ${this.spec.identity.name}] Running. Waiting for emails...`);
  }

  async stop(): Promise<void> {
    console.log(`[Agent ${this.spec.identity.name}] Shutting down...`);
    this.running = false;
    await this.mailbox?.close();
    console.log(`[Agent ${this.spec.identity.name}] Stopped.`);
  }

  isRunning(): boolean {
    return this.running;
  }
}
