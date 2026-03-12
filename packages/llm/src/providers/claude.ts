import Anthropic from '@anthropic-ai/sdk';
import type { LLMResponse, LLMConfig, ToolDefinition } from '@kube-agents/core';
import { LLMError } from '@kube-agents/core';
import type { LLMProviderInterface, CompletionRequest } from '../provider.js';

export class ClaudeProvider implements LLMProviderInterface {
  readonly name = 'claude';
  private readonly client: Anthropic;
  private readonly config: LLMConfig;

  constructor(config: LLMConfig, apiKey?: string) {
    this.config = config;
    this.client = new Anthropic({
      apiKey: apiKey ?? process.env['ANTHROPIC_API_KEY'],
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });
  }

  async complete(request: CompletionRequest): Promise<LLMResponse> {
    try {
      const systemMessage = request.messages.find((m) => m.role === 'system');
      const nonSystemMessages = request.messages.filter((m) => m.role !== 'system');

      const messages: Anthropic.MessageParam[] = nonSystemMessages.map((m) => {
        if (m.role === 'tool') {
          return {
            role: 'user' as const,
            content: [
              {
                type: 'tool_result' as const,
                tool_use_id: m.toolCallId ?? '',
                content: m.content,
              },
            ],
          };
        }

        if (m.role === 'assistant' && m.toolCalls?.length) {
          return {
            role: 'assistant' as const,
            content: [
              ...(m.content ? [{ type: 'text' as const, text: m.content }] : []),
              ...m.toolCalls.map((tc) => ({
                type: 'tool_use' as const,
                id: tc.id,
                name: tc.name,
                input: JSON.parse(tc.arguments),
              })),
            ],
          };
        }

        return {
          role: m.role as 'user' | 'assistant',
          content: m.content,
        };
      });

      const tools: Anthropic.Tool[] | undefined = request.tools?.map((t) =>
        this.convertTool(t),
      );

      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: request.maxTokens ?? this.config.maxTokens,
        temperature: request.temperature ?? this.config.temperature,
        ...(systemMessage ? { system: systemMessage.content } : {}),
        messages,
        ...(tools?.length ? { tools } : {}),
      });

      return this.convertResponse(response);
    } catch (err) {
      throw new LLMError(`Claude API error: ${err instanceof Error ? err.message : String(err)}`, err);
    }
  }

  private convertTool(tool: ToolDefinition): Anthropic.Tool {
    return {
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object' as const,
        properties: Object.fromEntries(
          Object.entries(tool.parameters).map(([key, param]) => [
            key,
            { type: param.type, description: param.description },
          ]),
        ),
        required: Object.entries(tool.parameters)
          .filter(([_, param]) => param.required)
          .map(([key]) => key),
      },
    };
  }

  private convertResponse(response: Anthropic.Message): LLMResponse {
    let content = '';
    const toolCalls: LLMResponse['toolCalls'] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        content += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: JSON.stringify(block.input),
        });
      }
    }

    return {
      content,
      toolCalls,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      finishReason: response.stop_reason === 'tool_use' ? 'tool_calls' : 'stop',
    };
  }
}
