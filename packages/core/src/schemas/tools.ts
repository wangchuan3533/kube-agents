import { z } from 'zod';

export const ToolParameterSchema: z.ZodType = z.lazy(() =>
  z.object({
    type: z.enum(['string', 'number', 'boolean', 'object', 'array']),
    description: z.string().optional(),
    required: z.boolean().default(false),
    properties: z.record(ToolParameterSchema).optional(),
    items: ToolParameterSchema.optional(),
  }),
);

export type ToolParameter = z.infer<typeof ToolParameterSchema>;

export const ToolRefSchema = z.object({
  name: z.string().min(1),
  config: z.record(z.unknown()).optional(),
});

export type ToolRef = z.infer<typeof ToolRefSchema>;

export const SkillRefSchema = z.object({
  name: z.string().min(1),
  config: z.record(z.unknown()).optional(),
});

export type SkillRef = z.infer<typeof SkillRefSchema>;

export const ToolDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  parameters: z.record(ToolParameterSchema),
});

export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;

export const ToolResultSchema = z.object({
  toolCallId: z.string(),
  name: z.string(),
  result: z.string(),
  isError: z.boolean().default(false),
});

export type ToolResult = z.infer<typeof ToolResultSchema>;
