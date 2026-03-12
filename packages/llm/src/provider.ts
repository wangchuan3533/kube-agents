import type { LLMMessage, LLMResponse, ToolDefinition, LLMConfig } from '@kube-agents/core';

export interface LLMProviderOptions {
  config: LLMConfig;
  apiKey?: string;
}

export interface CompletionRequest {
  messages: LLMMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
}

export interface LLMProviderInterface {
  readonly name: string;
  complete(request: CompletionRequest): Promise<LLMResponse>;
}
