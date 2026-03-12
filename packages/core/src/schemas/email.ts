import { z } from 'zod';
import { EMAIL_REGEX } from './identity.js';

export const AttachmentSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  data: z.string(), // base64 encoded
});

export type Attachment = z.infer<typeof AttachmentSchema>;

export const EmailSchema = z.object({
  id: z.string().uuid(),
  from: z.string().regex(EMAIL_REGEX),
  to: z.array(z.string().regex(EMAIL_REGEX)).min(1),
  subject: z.string().min(1),
  body: z.string(),
  inReplyTo: z.string().uuid().optional(),
  threadId: z.string().uuid().optional(),
  attachments: z.array(AttachmentSchema).default([]),
  timestamp: z.coerce.date(),
});

export type Email = z.infer<typeof EmailSchema>;

export const EMAIL_HEADERS = {
  PRIORITY: 'X-Priority',
  AGENT_NAME: 'X-Agent-Name',
  TOOL_RESULT: 'X-Tool-Result',
} as const;
