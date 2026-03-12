import type { LLMResponse, LLMConfig, ToolDefinition, LLMMessage } from '@kube-agents/core';
import { LLMError } from '@kube-agents/core';
import type { LLMProviderInterface, CompletionRequest } from '../provider.js';

interface OllamaChatMessage {
  role: string;
  content: string;
}

interface OllamaChatResponse {
  message: { role: string; content: string };
  done: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaProvider implements LLMProviderInterface {
  readonly name = 'ollama';
  private readonly config: LLMConfig;
  private readonly baseUrl: string;

  constructor(config: LLMConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl ?? 'http://localhost:11434';
  }

  async complete(request: CompletionRequest): Promise<LLMResponse> {
    try {
      const messages: OllamaChatMessage[] = request.messages
        .filter((m) => m.role !== 'tool') // Ollama doesn't support tool messages natively
        .map((m) => ({
          role: m.role === 'system' ? 'system' : m.role === 'assistant' ? 'assistant' : 'user',
          content: this.formatContent(m, request.tools),
        }));

      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          messages,
          stream: false,
          options: {
            temperature: request.temperature ?? this.config.temperature,
            num_predict: request.maxTokens ?? this.config.maxTokens,
          },
        }),
      });

      if (!response.ok) {
        throw new LLMError(`Ollama HTTP error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as OllamaChatResponse;
      return this.convertResponse(data);
    } catch (err) {
      if (err instanceof LLMError) throw err;
      throw new LLMError(`Ollama API error: ${err instanceof Error ? err.message : String(err)}`, err);
    }
  }

  private formatContent(message: LLMMessage, tools?: ToolDefinition[]): string {
    // For Ollama, we inject tool definitions into the system prompt
    if (message.role === 'system' && tools?.length) {
      const toolsDesc = tools
        .map((t) => `- ${t.name}: ${t.description}`)
        .join('\n');
      return `${message.content}\n\nAvailable tools:\n${toolsDesc}`;
    }
    return message.content;
  }

  private convertResponse(data: OllamaChatResponse): LLMResponse {
    return {
      content: data.message.content,
      toolCalls: [], // Ollama basic mode doesn't return structured tool calls
      usage: {
        promptTokens: data.prompt_eval_count ?? 0,
        completionTokens: data.eval_count ?? 0,
        totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
      },
      finishReason: 'stop',
    };
  }
}
