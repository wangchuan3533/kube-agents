import { z } from 'zod';

export const LLMProviderSchema = z.enum(['claude', 'openai', 'ollama']);
export type LLMProvider = z.infer<typeof LLMProviderSchema>;

export const LLMConfigSchema = z.object({
  provider: LLMProviderSchema,
  model: z.string().min(1),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().positive().default(4096),
  apiKeySecret: z.string().optional(), // K8s secret name
  baseUrl: z.string().url().optional(), // for Ollama or custom endpoints
});

export type LLMConfig = z.infer<typeof LLMConfigSchema>;

export const LLMMessageRoleSchema = z.enum(['system', 'user', 'assistant', 'tool']);
export type LLMMessageRole = z.infer<typeof LLMMessageRoleSchema>;

export const LLMMessageSchema = z.object({
  role: LLMMessageRoleSchema,
  content: z.string(),
  toolCallId: z.string().optional(),
  toolCalls: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        arguments: z.string(), // JSON string
      }),
    )
    .optional(),
});

export type LLMMessage = z.infer<typeof LLMMessageSchema>;

export const LLMResponseSchema = z.object({
  content: z.string(),
  toolCalls: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        arguments: z.string(),
      }),
    )
    .default([]),
  usage: z.object({
    promptTokens: z.number(),
    completionTokens: z.number(),
    totalTokens: z.number(),
  }),
  finishReason: z.enum(['stop', 'tool_calls', 'length', 'error']),
});

export type LLMResponse = z.infer<typeof LLMResponseSchema>;
