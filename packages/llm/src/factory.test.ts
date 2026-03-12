import { describe, it, expect } from 'vitest';
import { createLLMProvider } from './factory.js';
import { ClaudeProvider } from './providers/claude.js';
import { OpenAIProvider } from './providers/openai.js';
import { OllamaProvider } from './providers/ollama.js';

describe('createLLMProvider', () => {
  it('creates a Claude provider', () => {
    const provider = createLLMProvider(
      { provider: 'claude', model: 'claude-sonnet-4-20250514', temperature: 0.7, maxTokens: 4096 },
      'test-key',
    );
    expect(provider).toBeInstanceOf(ClaudeProvider);
    expect(provider.name).toBe('claude');
  });

  it('creates an OpenAI provider', () => {
    const provider = createLLMProvider(
      { provider: 'openai', model: 'gpt-4o', temperature: 0.7, maxTokens: 4096 },
      'test-key',
    );
    expect(provider).toBeInstanceOf(OpenAIProvider);
    expect(provider.name).toBe('openai');
  });

  it('creates an Ollama provider', () => {
    const provider = createLLMProvider({
      provider: 'ollama',
      model: 'llama3',
      temperature: 0.7,
      maxTokens: 4096,
      baseUrl: 'http://localhost:11434',
    });
    expect(provider).toBeInstanceOf(OllamaProvider);
    expect(provider.name).toBe('ollama');
  });

  it('throws for unknown provider', () => {
    expect(() =>
      // @ts-expect-error testing invalid input
      createLLMProvider({ provider: 'unknown', model: 'test', temperature: 0.7, maxTokens: 4096 }),
    ).toThrow('Unknown LLM provider');
  });
});
