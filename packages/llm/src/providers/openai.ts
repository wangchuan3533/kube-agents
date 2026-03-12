import OpenAI from 'openai';
import type { LLMResponse, LLMConfig } from '@kube-agents/core';
import { LLMError } from '@kube-agents/core';
import type { LLMProviderInterface, CompletionRequest } from '../provider.js';

export class OpenAIProvider implements LLMProviderInterface {
  readonly name = 'openai';
  private readonly client: OpenAI;
  private readonly config: LLMConfig;

  constructor(config: LLMConfig, apiKey?: string) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: apiKey ?? process.env['OPENAI_API_KEY'],
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });
  }

  async complete(request: CompletionRequest): Promise<LLMResponse> {
    try {
      const messages: OpenAI.ChatCompletionMessageParam[] = request.messages.map((m) => {
        if (m.role === 'tool') {
          return {
            role: 'tool' as const,
            tool_call_id: m.toolCallId ?? '',
            content: m.content,
          };
        }

        if (m.role === 'assistant' && m.toolCalls?.length) {
          return {
            role: 'assistant' as const,
            content: m.content || null,
            tool_calls: m.toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function' as const,
              function: { name: tc.name, arguments: tc.arguments },
            })),
          };
        }

        return {
          role: m.role as 'system' | 'user' | 'assistant',
          content: m.content,
        };
      });

      const tools: OpenAI.ChatCompletionTool[] | undefined = request.tools?.map((t) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: {
            type: 'object' as const,
            properties: Object.fromEntries(
              Object.entries(t.parameters).map(([key, param]) => [
                key,
                { type: param.type, description: param.description },
              ]),
            ),
            required: Object.entries(t.parameters)
              .filter(([_, param]) => param.required)
              .map(([key]) => key),
          },
        },
      }));

      const response = await this.client.chat.completions.create({
        model: this.config.model,
        max_tokens: request.maxTokens ?? this.config.maxTokens,
        temperature: request.temperature ?? this.config.temperature,
        messages,
        ...(tools?.length ? { tools } : {}),
      });

      return this.convertResponse(response);
    } catch (err) {
      throw new LLMError(`OpenAI API error: ${err instanceof Error ? err.message : String(err)}`, err);
    }
  }

  private convertResponse(response: OpenAI.ChatCompletion): LLMResponse {
    const choice = response.choices[0];
    if (!choice) throw new LLMError('No response choices returned from OpenAI');

    const toolCalls: LLMResponse['toolCalls'] =
      choice.message.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      })) ?? [];

    return {
      content: choice.message.content ?? '',
      toolCalls,
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      },
      finishReason:
        choice.finish_reason === 'tool_calls' ? 'tool_calls' : 'stop',
    };
  }
}
