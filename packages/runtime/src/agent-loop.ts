import type { Email, AgentSpec } from '@kube-agents/core';
import type { LLMProviderInterface } from '@kube-agents/llm';
import type { ToolRegistry } from '@kube-agents/tools';
import type { Mailbox } from '@kube-agents/mail';
import { buildContext } from './context-builder.js';

const MAX_TOOL_ITERATIONS = 10;

export interface AgentLoopDeps {
  spec: AgentSpec;
  mailbox: Mailbox;
  llm: LLMProviderInterface;
  toolRegistry: ToolRegistry;
}

export async function handleEmail(deps: AgentLoopDeps, email: Email): Promise<void> {
  const { spec, mailbox, llm, toolRegistry } = deps;

  // Build initial context from thread history (empty for now — future: fetch from store)
  const threadHistory: Email[] = [];
  let messages = buildContext(spec, email, threadHistory);

  const availableTools = toolRegistry.listAllowed(spec.permissions);

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const response = await llm.complete({
      messages,
      tools: availableTools.length > 0 ? availableTools : undefined,
    });

    if (response.finishReason === 'tool_calls' && response.toolCalls.length > 0) {
      // Add assistant message with tool calls
      messages.push({
        role: 'assistant',
        content: response.content,
        toolCalls: response.toolCalls,
      });

      // Execute all tool calls
      const results = await Promise.all(
        response.toolCalls.map((tc) =>
          toolRegistry.execute(tc.name, JSON.parse(tc.arguments), tc.id),
        ),
      );

      // Add tool results to messages
      for (const result of results) {
        messages.push({
          role: 'tool',
          content: result.result,
          toolCallId: result.toolCallId,
        });
      }

      continue;
    }

    // No more tool calls — send the final response as an email reply
    if (response.content) {
      await mailbox.reply(email, response.content);
    }

    return;
  }

  // Max iterations reached
  await mailbox.reply(
    email,
    'I reached the maximum number of tool iterations. Here is what I have so far.',
  );
}
