import { type Email, EmailSchema, MailError } from '@kube-agents/core';
import { type JsMsg } from 'nats';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodeEmail(email: Email): Uint8Array {
  return encoder.encode(JSON.stringify(email));
}

export function decodeEmail(data: Uint8Array): Email {
  try {
    const raw = JSON.parse(decoder.decode(data));
    return EmailSchema.parse(raw);
  } catch (err) {
    throw new MailError('Failed to decode email message', err);
  }
}

export function decodeEmailFromMsg(msg: JsMsg): Email {
  return decodeEmail(msg.data);
}
