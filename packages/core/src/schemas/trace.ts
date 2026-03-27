import { z } from 'zod';
import { LLMMessageSchema } from './llm.js';

export const TraceRunStatusSchema = z.enum(['running', 'completed', 'error']);
export type TraceRunStatus = z.infer<typeof TraceRunStatusSchema>;

export const TraceRunSchema = z.object({
  id: z.string().uuid(),
  agentName: z.string(),
  agentEmail: z.string(),
  emailId: z.string(),
  threadId: z.string().optional(),
  startedAt: z.coerce.date(),
  completedAt: z.coerce.date().optional(),
  status: TraceRunStatusSchema,
  error: z.string().optional(),
  totalLatencyMs: z.number().optional(),
  iterationCount: z.number().int().default(0),
  totalTokens: z.number().int().default(0),
  promptTokens: z.number().int().default(0),
  completionTokens: z.number().int().default(0),
});

export type TraceRun = z.infer<typeof TraceRunSchema>;

export const TraceSpanTypeSchema = z.enum(['llm_call', 'tool_call']);
export type TraceSpanType = z.infer<typeof TraceSpanTypeSchema>;

export const TraceLLMSpanSchema = z.object({
  provider: z.string(),
  model: z.string(),
  messages: z.array(LLMMessageSchema),
  completion: z.string(),
  toolCalls: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        arguments: z.string(),
      }),
    )
    .default([]),
  finishReason: z.string(),
  usage: z.object({
    promptTokens: z.number(),
    completionTokens: z.number(),
    totalTokens: z.number(),
  }),
  temperature: z.number().optional(),
  iteration: z.number().int(),
});

export type TraceLLMSpan = z.infer<typeof TraceLLMSpanSchema>;

export const TraceToolSpanSchema = z.object({
  name: z.string(),
  arguments: z.string(),
  result: z.string(),
  isError: z.boolean(),
  toolCallId: z.string(),
});

export type TraceToolSpan = z.infer<typeof TraceToolSpanSchema>;

export const TraceSpanSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  agentName: z.string(),
  type: TraceSpanTypeSchema,
  startedAt: z.coerce.date(),
  completedAt: z.coerce.date(),
  latencyMs: z.number(),
  llm: TraceLLMSpanSchema.optional(),
  tool: TraceToolSpanSchema.optional(),
});

export type TraceSpan = z.infer<typeof TraceSpanSchema>;
