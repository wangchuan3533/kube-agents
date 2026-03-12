import { z } from 'zod';

export const EMAIL_REGEX = /^[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

export const AgentIdentitySchema = z.object({
  name: z.string().min(1),
  email: z.string().regex(EMAIL_REGEX, 'Must be a valid email address'),
  groups: z.array(z.string().regex(EMAIL_REGEX)).default([]),
});

export type AgentIdentity = z.infer<typeof AgentIdentitySchema>;
