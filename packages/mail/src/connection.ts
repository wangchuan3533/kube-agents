import { connect, type NatsConnection, type ConnectionOptions } from 'nats';
import { MailError } from '@kube-agents/core';

export interface NatsConnectionOptions {
  servers?: string | string[];
  token?: string;
  user?: string;
  pass?: string;
  name?: string;
  maxReconnectAttempts?: number;
}

export async function createNatsConnection(
  options: NatsConnectionOptions = {},
): Promise<NatsConnection> {
  const connectOpts: ConnectionOptions = {
    servers: options.servers ?? 'localhost:4222',
    name: options.name ?? 'kube-agents',
    maxReconnectAttempts: options.maxReconnectAttempts ?? -1, // unlimited
    reconnectTimeWait: 2000,
    token: options.token,
    user: options.user,
    pass: options.pass,
  };

  try {
    return await connect(connectOpts);
  } catch (err) {
    throw new MailError(`Failed to connect to NATS at ${String(connectOpts.servers)}`, err);
  }
}
