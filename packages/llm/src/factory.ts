import type { LLMConfig } from '@kube-agents/core';
import { LLMError } from '@kube-agents/core';
import type { LLMProviderInterface } from './provider.js';
import { ClaudeProvider } from './providers/claude.js';
import { OpenAIProvider } from './providers/openai.js';
import { OllamaProvider } from './providers/ollama.js';

export function createLLMProvider(config: LLMConfig, apiKey?: string): LLMProviderInterface {
  switch (config.provider) {
    case 'claude':
      return new ClaudeProvider(config, apiKey);
    case 'openai':
      return new OpenAIProvider(config, apiKey);
    case 'ollama':
      return new OllamaProvider(config);
    default:
      throw new LLMError(`Unknown LLM provider: ${config.provider as string}`);
  }
}
