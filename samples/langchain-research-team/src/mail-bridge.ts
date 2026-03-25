/**
 * Mail Bridge — connects kube-agents NATS mailbox to a LangChain agent.
 *
 * When an email arrives, it invokes the LangChain agent graph and sends
 * the final response back as an email reply.
 */
import type { Email, AgentIdentity } from '@kube-agents/core';
import { Mailbox, createNatsConnection, type NatsConnectionOptions } from '@kube-agents/mail';
import type { Runnable } from '@langchain/core/runnables';
import type { BaseMessage } from '@langchain/core/messages';

type AgentGraph = Runnable<{ messages: BaseMessage[] }, { messages: BaseMessage[] }>;

/** Function that receives a live Mailbox and returns a compiled LangGraph. */
export type GraphFactory = (mailbox: Mailbox) => AgentGraph;

export interface MailBridgeOptions {
  identity: AgentIdentity;
  nats?: NatsConnectionOptions;
  /** Factory that builds the LangChain graph once the mailbox is ready. */
  graphFactory: GraphFactory;
}

export class MailBridge {
  private readonly identity: AgentIdentity;
  private readonly natsOptions: NatsConnectionOptions;
  private readonly graphFactory: GraphFactory;
  private mailbox: Mailbox | undefined;
  private graph: AgentGraph | undefined;

  constructor(options: MailBridgeOptions) {
    this.identity = options.identity;
    this.natsOptions = options.nats ?? {};
    this.graphFactory = options.graphFactory;
  }

  async start(): Promise<void> {
    console.log(`[${this.identity.name}] Connecting to NATS...`);
    const nc = await createNatsConnection({
      ...this.natsOptions,
      name: `agent-${this.identity.name}`,
    });

    this.mailbox = new Mailbox({ identity: this.identity, nc });
    await this.mailbox.init();
    console.log(`[${this.identity.name}] Mailbox ready: ${this.identity.email}`);

    // Build the LangChain graph now that the mailbox is available
    this.graph = this.graphFactory(this.mailbox);
    console.log(`[${this.identity.name}] LangChain graph compiled.`);

    await this.mailbox.subscribe(async (email) => {
      console.log(`[${this.identity.name}] Email from ${email.from}: ${email.subject}`);
      await this.handleEmail(email);
    });

    console.log(`[${this.identity.name}] Running. Waiting for emails...`);
  }

  async stop(): Promise<void> {
    await this.mailbox?.close();
    console.log(`[${this.identity.name}] Stopped.`);
  }

  private async handleEmail(email: Email): Promise<void> {
    if (!this.graph || !this.mailbox) {
      throw new Error('MailBridge not started');
    }

    const { HumanMessage } = await import('@langchain/core/messages');

    const userContent = [
      `From: ${email.from}`,
      `Subject: ${email.subject}`,
      '',
      email.body,
    ].join('\n');

    try {
      const result = await this.graph.invoke({
        messages: [new HumanMessage(userContent)],
      });

      // Extract the last AI message as the reply
      const lastMsg = result.messages[result.messages.length - 1];
      const replyBody = typeof lastMsg.content === 'string'
        ? lastMsg.content
        : JSON.stringify(lastMsg.content);

      await this.mailbox.reply(email, replyBody);
      console.log(`[${this.identity.name}] Replied to ${email.from}`);
    } catch (err) {
      console.error(`[${this.identity.name}] Error:`, err);
      await this.mailbox.reply(email, `Error processing your request: ${err}`);
    }
  }
}
