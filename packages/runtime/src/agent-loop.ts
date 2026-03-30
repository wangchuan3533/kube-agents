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

  // Start a trace for this email processing cycle
  const trace = tracer?.startTrace(spec.identity.name, `email:${email.subject.slice(0, 50)}`, {
    sessionId: email.threadId,
    inputs: {
      emailId: email.id,
      from: email.from,
      to: email.to,
      subject: email.subject,
      body: email.body,
    },
    metadata: {
      agentName: spec.identity.name,
      agentEmail: spec.identity.email,
    },
    tags: spec.identity.groups ?? [],
  });

  try {
    const threadHistory: Email[] = [];
    let messages = buildContext(spec, email, threadHistory);

    const availableTools = toolRegistry.listAllowed(spec.permissions);

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      console.log(`[Agent ${spec.identity.name}] LLM call #${iteration + 1} (${messages.length} messages, ${availableTools.length} tools)`);

      // Start an LLM run within the trace
      const llmRun = trace?.startRun(`llm:${spec.llm.model}`, 'llm', {
        metadata: { iteration: String(iteration + 1) },
      });

      const messagesSnapshot: LLMMessage[] = messages.map((m) => ({ ...m }));
      const response = await llm.complete({
        messages,
        tools: availableTools.length > 0 ? availableTools : undefined,
      });

      console.log(`[Agent ${spec.identity.name}] LLM response: ${response.finishReason}, ${response.toolCalls.length} tool calls, ${response.usage.totalTokens} tokens`);

      // Record LLM result and complete the run
      llmRun?.setLLMResult({
        model: spec.llm.model,
        provider: spec.llm.provider,
        temperature: spec.llm.temperature,
        promptMessages: messagesSnapshot,
        completion: response.content,
        finishReason: response.finishReason,
        toolCalls: response.toolCalls,
        usage: response.usage,
      });
      await llmRun?.complete();

      // Accumulate tokens on the trace
      trace?.addTokens(response.usage);

      if (response.finishReason === 'tool_calls' && response.toolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          content: response.content,
          toolCalls: response.toolCalls,
        });

        // Execute all tool calls with tracing (as children of the LLM run)
        const results = await Promise.all(
          response.toolCalls.map(async (tc) => {
            const toolRun = trace?.startRun(`tool:${tc.name}`, 'tool', {
              inputs: { arguments: tc.arguments },
              metadata: { toolCallId: tc.id },
            });

            const result = await toolRegistry.execute(tc.name, JSON.parse(tc.arguments), tc.id);

            toolRun?.setToolResult(result.result, result.isError ?? false);
            if (result.isError) {
              await toolRun?.fail(result.result);
            } else {
              await toolRun?.complete({ result: result.result });
            }

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

      await trace?.complete({ response: response.content });
      return;
    }

    // Max iterations reached
    await mailbox.reply(
      email,
      'I reached the maximum number of tool iterations. Here is what I have so far.',
    );
    await trace?.complete({ response: 'Max iterations reached' });
  } catch (err) {
    await trace?.fail(err instanceof Error ? err.message : String(err));
    throw err;
  }
}
