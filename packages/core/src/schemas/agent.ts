import { z } from 'zod';
import { AgentIdentitySchema } from './identity.js';
import { LLMConfigSchema } from './llm.js';
import { ToolRefSchema, SkillRefSchema } from './tools.js';
import { PermissionsSchema } from './permissions.js';

export const ResourceSpecSchema = z.object({
  cpu: z.string().default('500m'),
  memory: z.string().default('512Mi'),
});

export type ResourceSpec = z.infer<typeof ResourceSpecSchema>;

export const AgentSpecSchema = z.object({
  identity: AgentIdentitySchema,
  llm: LLMConfigSchema,
  system: z.string().min(1), // system prompt
  tools: z.array(ToolRefSchema).default([]),
  skills: z.array(SkillRefSchema).default([]),
  permissions: PermissionsSchema.default({}),
  resources: ResourceSpecSchema.default({}),
  replicas: z.number().int().positive().default(1),
});

export type AgentSpec = z.infer<typeof AgentSpecSchema>;

export const AgentStatusPhaseSchema = z.enum([
  'Pending',
  'Running',
  'Error',
  'Terminated',
]);

export type AgentStatusPhase = z.infer<typeof AgentStatusPhaseSchema>;

export const AgentStatusSchema = z.object({
  phase: AgentStatusPhaseSchema,
  message: z.string().optional(),
  readyReplicas: z.number().int().default(0),
  messagesReceived: z.number().int().default(0),
  messagesSent: z.number().int().default(0),
  lastActiveAt: z.coerce.date().optional(),
});

export type AgentStatus = z.infer<typeof AgentStatusSchema>;

export const AgentResourceSchema = z.object({
  apiVersion: z.literal('agents.kube-agents.io/v1alpha1'),
  kind: z.literal('Agent'),
  metadata: z.object({
    name: z.string().min(1),
    namespace: z.string().default('default'),
    labels: z.record(z.string()).optional(),
    annotations: z.record(z.string()).optional(),
  }),
  spec: AgentSpecSchema,
  status: AgentStatusSchema.optional(),
});

export type AgentResource = z.infer<typeof AgentResourceSchema>;
