import {
  type NatsConnection,
  type JetStreamClient,
  type JetStreamManager,
  type ConsumerConfig,
  type ConsumerMessages,
  AckPolicy,
  DeliverPolicy,
  RetentionPolicy,
  StorageType,
} from 'nats';
import { type Email, type AgentIdentity, MailError } from '@kube-agents/core';
import { directSubject, groupSubject, subjectsForAgent, STREAM_NAME, STREAM_SUBJECTS } from './subjects.js';
import { encodeEmail, decodeEmailFromMsg } from './serialization.js';
import { randomUUID } from 'node:crypto';

export interface MailboxOptions {
  identity: AgentIdentity;
  nc: NatsConnection;
  durableName?: string;
}

export type EmailHandler = (email: Email) => Promise<void>;

export class Mailbox {
  private readonly identity: AgentIdentity;
  private readonly nc: NatsConnection;
  private js: JetStreamClient | undefined;
  private jsm: JetStreamManager | undefined;
  private readonly durableName: string;
  private consumerMessages: ConsumerMessages | undefined;

  constructor(options: MailboxOptions) {
    this.identity = options.identity;
    this.nc = options.nc;
    this.durableName = options.durableName ?? `agent-${options.identity.name}`;
  }

  async init(): Promise<void> {
    this.jsm = await this.nc.jetstreamManager();
    this.js = this.nc.jetstream();

    // Ensure the mail stream exists
    try {
      await this.jsm.streams.info(STREAM_NAME);
    } catch {
      await this.jsm.streams.add({
        name: STREAM_NAME,
        subjects: STREAM_SUBJECTS,
        retention: RetentionPolicy.Limits,
        storage: StorageType.File,
        max_age: 7 * 24 * 60 * 60 * 1_000_000_000, // 7 days in nanoseconds
        max_bytes: 1024 * 1024 * 1024, // 1 GB
      });
    }
  }

  async send(email: Omit<Email, 'id' | 'timestamp'>): Promise<Email> {
    if (!this.js) throw new MailError('Mailbox not initialized. Call init() first.');

    const fullEmail: Email = {
      ...email,
      id: randomUUID(),
      timestamp: new Date(),
    };

    // Publish to each recipient's subject
    for (const recipient of fullEmail.to) {
      const subject = recipient.includes('@')
        ? this.isGroupEmail(recipient)
          ? groupSubject(recipient)
          : directSubject(recipient)
        : directSubject(recipient);

      await this.js.publish(subject, encodeEmail(fullEmail));
    }

    return fullEmail;
  }

  async reply(original: Email, body: string): Promise<Email> {
    return this.send({
      from: this.identity.email,
      to: [original.from],
      subject: original.subject.startsWith('Re: ')
        ? original.subject
        : `Re: ${original.subject}`,
      body,
      inReplyTo: original.id,
      threadId: original.threadId ?? original.id,
      attachments: [],
    });
  }

  async subscribe(handler: EmailHandler): Promise<void> {
    if (!this.js || !this.jsm) throw new MailError('Mailbox not initialized. Call init() first.');

    const subjects = subjectsForAgent(this.identity.email, this.identity.groups);

    // Create a durable consumer with a filter for all our subjects
    const consumerConfig: Partial<ConsumerConfig> = {
      durable_name: this.durableName,
      ack_policy: AckPolicy.Explicit,
      deliver_policy: DeliverPolicy.All,
      filter_subjects: subjects,
    };

    const consumer = await this.js.consumers.get(STREAM_NAME, this.durableName).catch(async () => {
      await this.jsm!.consumers.add(STREAM_NAME, consumerConfig);
      return this.js!.consumers.get(STREAM_NAME, this.durableName);
    });

    this.consumerMessages = await consumer.consume();

    (async () => {
      for await (const msg of this.consumerMessages!) {
        try {
          const email = decodeEmailFromMsg(msg);
          await handler(email);
          msg.ack();
        } catch (err) {
          // NAK to retry later
          msg.nak();
          console.error(`[Mailbox ${this.identity.email}] Error processing message:`, err);
        }
      }
    })().catch(() => {
      // subscription ended
    });
  }

  async close(): Promise<void> {
    await this.consumerMessages?.close();
  }

  private isGroupEmail(email: string): boolean {
    return this.identity.groups.includes(email);
  }
}
