import type { Email, AgentSpec, LLMMessage } from '@kube-agents/core';
import type { LLMProviderInterface } from '@kube-agents/llm';
import type { ToolRegistry } from '@kube-agents/tools';
import type { Mailbox } from '@kube-agents/mail';
import type { Tracer } from './tracer.js';
import { buildContext } from './context-builder.js';

const MAX_TOOL_ITERATIONS = 10;

export interface AgentLoopDeps {
  spec: AgentSpec;
  mailbox: Mailbox;
  llm: LLMProviderInterface;
  toolRegistry: ToolRegistry;
  tracer?: Tracer;
}

export async function handleEmail(deps: AgentLoopDeps, email: Email): Promise<void> {
  const { spec, mailbox, llm, toolRegistry, tracer } = deps;

  // Start trace run
  const run = tracer?.startRun(
    spec.identity.name,
    spec.identity.email,
    email.id,
    email.threadId,
  );

  try {
    const threadHistory: Email[] = [];
    let messages = buildContext(spec, email, threadHistory);

    const availableTools = toolRegistry.listAllowed(spec.permissions);

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      console.log(`[Agent ${spec.identity.name}] LLM call #${iteration + 1} (${messages.length} messages, ${availableTools.length} tools)`);

      // Trace: record LLM call timing
      const llmStart = new Date();
      const messagesSnapshot: LLMMessage[] = messages.map((m) => ({ ...m }));
      const response = await llm.complete({
        messages,
        tools: availableTools.length > 0 ? availableTools : undefined,
      });
      const llmEnd = new Date();

      console.log(`[Agent ${spec.identity.name}] LLM response: ${response.finishReason}, ${response.toolCalls.length} tool calls, ${response.usage.totalTokens} tokens`);

      // Trace: record LLM span
      await run?.recordLLMCall(
        {
          provider: spec.llm.provider,
          model: spec.llm.model,
          messages: messagesSnapshot,
          completion: response.content,
          toolCalls: response.toolCalls,
          finishReason: response.finishReason,
          usage: response.usage,
          temperature: spec.llm.temperature,
          iteration: iteration + 1,
        },
        llmStart,
        llmEnd,
      );

      if (response.finishReason === 'tool_calls' && response.toolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          content: response.content,
          toolCalls: response.toolCalls,
        });

        // Execute all tool calls with tracing
        const results = await Promise.all(
          response.toolCalls.map(async (tc) => {
            const toolStart = new Date();
            const result = await toolRegistry.execute(tc.name, JSON.parse(tc.arguments), tc.id);
            const toolEnd = new Date();

            // Trace: record tool span
            await run?.recordToolCall(
              {
                name: tc.name,
                arguments: tc.arguments,
                result: result.result,
                isError: result.isError ?? false,
                toolCallId: result.toolCallId,
              },
              toolStart,
              toolEnd,
            );

            return result;
          }),
        );

        for (const result of results) {
          messages.push({
            role: 'tool',
            content: result.result,
            toolCallId: result.toolCallId,
          });
        }

        continue;
      }

      // No more tool calls — send the final response
      if (response.content) {
        console.log(`[Agent ${spec.identity.name}] Sending reply to ${email.from}`);
        await mailbox.reply(email, response.content);
      }

      await run?.complete();
      return;
    }

    // Max iterations reached
    await mailbox.reply(
      email,
      'I reached the maximum number of tool iterations. Here is what I have so far.',
    );
    await run?.complete();
  } catch (err) {
    await run?.fail(err instanceof Error ? err.message : String(err));
    throw err;
  }
}
