import { z } from 'zod';
import { LLMMessageSchema } from './llm.js';

// ---------------------------------------------------------------------------
// Status enums
// ---------------------------------------------------------------------------
export const TraceStatusSchema = z.enum(['running', 'completed', 'error']);
export type TraceStatus = z.infer<typeof TraceStatusSchema>;

export const RunTypeSchema = z.enum(['llm', 'tool', 'chain', 'retriever', 'agent']);
export type RunType = z.infer<typeof RunTypeSchema>;

export const FeedbackSourceSchema = z.enum(['human', 'code', 'llm']);
export type FeedbackSource = z.infer<typeof FeedbackSourceSchema>;

// ---------------------------------------------------------------------------
// Project — groups traces by agent or agent group
// ---------------------------------------------------------------------------
export const ProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().optional(),
  metadata: z.record(z.string()).default({}),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Project = z.infer<typeof ProjectSchema>;

// ---------------------------------------------------------------------------
// Trace — one end-to-end operation (email processing cycle)
// ---------------------------------------------------------------------------
export const TraceSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string(),
  sessionId: z.string().optional(), // for multi-turn grouping (threadId)
  status: TraceStatusSchema,
  inputs: z.record(z.unknown()).optional(),
  outputs: z.record(z.unknown()).optional(),
  error: z.string().optional(),
  metadata: z.record(z.string()).default({}),
  tags: z.array(z.string()).default([]),
  startedAt: z.coerce.date(),
  completedAt: z.coerce.date().optional(),
  totalLatencyMs: z.number().optional(),
  totalTokens: z.number().int().default(0),
  promptTokens: z.number().int().default(0),
  completionTokens: z.number().int().default(0),
  cost: z.number().optional(),
});
export type Trace = z.infer<typeof TraceSchema>;

// ---------------------------------------------------------------------------
// Run — individual execution unit (LLM call, tool call, chain step)
// Supports nesting via parentRunId
// ---------------------------------------------------------------------------
export const RunSchema = z.object({
  id: z.string().uuid(),
  traceId: z.string().uuid(),
  parentRunId: z.string().uuid().optional(),
  name: z.string(),
  runType: RunTypeSchema,
  status: TraceStatusSchema,
  inputs: z.record(z.unknown()).optional(),
  outputs: z.record(z.unknown()).optional(),
  error: z.string().optional(),
  metadata: z.record(z.string()).default({}),
  tags: z.array(z.string()).default([]),
  startedAt: z.coerce.date(),
  completedAt: z.coerce.date().optional(),
  latencyMs: z.number().optional(),
  // LLM-specific fields (populated when runType === 'llm')
  promptTokens: z.number().int().optional(),
  completionTokens: z.number().int().optional(),
  totalTokens: z.number().int().optional(),
  model: z.string().optional(),
  provider: z.string().optional(),
  temperature: z.number().optional(),
  promptMessages: z.array(LLMMessageSchema).optional(),
  completion: z.string().optional(),
  finishReason: z.string().optional(),
  toolCalls: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        arguments: z.string(),
      }),
    )
    .default([]),
});
export type Run = z.infer<typeof RunSchema>;

// ---------------------------------------------------------------------------
// Feedback — scores attached to runs or traces
// ---------------------------------------------------------------------------
export const FeedbackSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid().optional(),
  traceId: z.string().uuid(),
  key: z.string(),
  score: z.number().optional(),
  value: z.string().optional(),
  comment: z.string().optional(),
  source: FeedbackSourceSchema,
  createdAt: z.coerce.date(),
});
export type Feedback = z.infer<typeof FeedbackSchema>;

// ---------------------------------------------------------------------------
// Dataset — collection of test examples for evaluation
// ---------------------------------------------------------------------------
export const DatasetSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().optional(),
  metadata: z.record(z.string()).default({}),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Dataset = z.infer<typeof DatasetSchema>;

// ---------------------------------------------------------------------------
// Example — individual test case in a dataset
// ---------------------------------------------------------------------------
export const ExampleSchema = z.object({
  id: z.string().uuid(),
  datasetId: z.string().uuid(),
  inputs: z.record(z.unknown()),
  expectedOutputs: z.record(z.unknown()).optional(),
  metadata: z.record(z.string()).default({}),
  split: z.string().optional(),
  sourceRunId: z.string().uuid().optional(),
  createdAt: z.coerce.date(),
});
export type Example = z.infer<typeof ExampleSchema>;

// ---------------------------------------------------------------------------
// Experiment — results of evaluating against a dataset
// ---------------------------------------------------------------------------
export const ExperimentSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  datasetId: z.string().uuid(),
  description: z.string().optional(),
  metadata: z.record(z.string()).default({}),
  status: TraceStatusSchema,
  createdAt: z.coerce.date(),
  completedAt: z.coerce.date().optional(),
});
export type Experiment = z.infer<typeof ExperimentSchema>;

// ---------------------------------------------------------------------------
// ExperimentResult — per-example result in an experiment
// ---------------------------------------------------------------------------
export const ExperimentResultSchema = z.object({
  id: z.string().uuid(),
  experimentId: z.string().uuid(),
  exampleId: z.string().uuid(),
  traceId: z.string().uuid().optional(),
  outputs: z.record(z.unknown()).optional(),
  latencyMs: z.number().optional(),
  totalTokens: z.number().int().optional(),
  error: z.string().optional(),
  createdAt: z.coerce.date(),
});
export type ExperimentResult = z.infer<typeof ExperimentResultSchema>;

// ---------------------------------------------------------------------------
// Legacy compatibility — old TraceRun/TraceSpan types for backward compat
// These map to the new Trace/Run model in the NATS consumer
// ---------------------------------------------------------------------------
export const LegacyTraceRunStatusSchema = z.enum(['running', 'completed', 'error']);
export type LegacyTraceRunStatus = z.infer<typeof LegacyTraceRunStatusSchema>;

export const LegacyTraceRunSchema = z.object({
  id: z.string().uuid(),
  agentName: z.string(),
  agentEmail: z.string(),
  emailId: z.string(),
  threadId: z.string().optional(),
  startedAt: z.coerce.date(),
  completedAt: z.coerce.date().optional(),
  status: LegacyTraceRunStatusSchema,
  error: z.string().optional(),
  totalLatencyMs: z.number().optional(),
  iterationCount: z.number().int().default(0),
  totalTokens: z.number().int().default(0),
  promptTokens: z.number().int().default(0),
  completionTokens: z.number().int().default(0),
});
export type LegacyTraceRun = z.infer<typeof LegacyTraceRunSchema>;

export const LegacyTraceSpanTypeSchema = z.enum(['llm_call', 'tool_call']);
export type LegacyTraceSpanType = z.infer<typeof LegacyTraceSpanTypeSchema>;

export const LegacyTraceLLMSpanSchema = z.object({
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
export type LegacyTraceLLMSpan = z.infer<typeof LegacyTraceLLMSpanSchema>;

export const LegacyTraceToolSpanSchema = z.object({
  name: z.string(),
  arguments: z.string(),
  result: z.string(),
  isError: z.boolean(),
  toolCallId: z.string(),
});
export type LegacyTraceToolSpan = z.infer<typeof LegacyTraceToolSpanSchema>;

export const LegacyTraceSpanSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  agentName: z.string(),
  type: LegacyTraceSpanTypeSchema,
  startedAt: z.coerce.date(),
  completedAt: z.coerce.date(),
  latencyMs: z.number(),
  llm: LegacyTraceLLMSpanSchema.optional(),
  tool: LegacyTraceToolSpanSchema.optional(),
});
export type LegacyTraceSpan = z.infer<typeof LegacyTraceSpanSchema>;

// Re-export legacy types under old names for runtime backward compatibility
export {
  LegacyTraceRunSchema as TraceRunSchema,
  LegacyTraceRunStatusSchema as TraceRunStatusSchema,
  LegacyTraceLLMSpanSchema as TraceLLMSpanSchema,
  LegacyTraceToolSpanSchema as TraceToolSpanSchema,
  LegacyTraceSpanSchema as TraceSpanSchema,
};
export type {
  LegacyTraceRun as TraceRun,
  LegacyTraceRunStatus as TraceRunStatus,
  LegacyTraceLLMSpan as TraceLLMSpan,
  LegacyTraceToolSpan as TraceToolSpan,
  LegacyTraceSpan as TraceSpan,
};
