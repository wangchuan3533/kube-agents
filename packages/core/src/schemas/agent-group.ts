import { z } from 'zod';
import { EMAIL_REGEX } from './identity.js';

export const AgentGroupSpecSchema = z.object({
  email: z.string().regex(EMAIL_REGEX),
  members: z.array(z.string().regex(EMAIL_REGEX)).min(1),
  description: z.string().optional(),
});

export type AgentGroupSpec = z.infer<typeof AgentGroupSpecSchema>;

export const AgentGroupStatusSchema = z.object({
  memberCount: z.number().int().default(0),
  readyMembers: z.number().int().default(0),
});

export type AgentGroupStatus = z.infer<typeof AgentGroupStatusSchema>;

export const AgentGroupResourceSchema = z.object({
  apiVersion: z.literal('agents.kube-agents.io/v1alpha1'),
  kind: z.literal('AgentGroup'),
  metadata: z.object({
    name: z.string().min(1),
    namespace: z.string().default('default'),
    labels: z.record(z.string()).optional(),
    annotations: z.record(z.string()).optional(),
  }),
  spec: AgentGroupSpecSchema,
  status: AgentGroupStatusSchema.optional(),
});

export type AgentGroupResource = z.infer<typeof AgentGroupResourceSchema>;
