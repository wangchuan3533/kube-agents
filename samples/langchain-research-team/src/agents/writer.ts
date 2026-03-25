/**
 * Writer Agent — receives structured analysis and produces
 * polished research reports, replying to the original requester.
 */
import { StateGraph, MessagesAnnotation } from '@langchain/langgraph';
import { SystemMessage } from '@langchain/core/messages';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import type { Mailbox } from '@kube-agents/mail';
import { createLLM } from '../llm.js';
import { saveNoteTool, readNoteTool, listNotesTool } from '../tools/note-taking.js';
import { createEmailSendTool } from '../tools/email-send.js';

const SYSTEM_PROMPT = `You are a Writer Agent in a multi-agent research team.

Your role:
- Receive structured analysis from the analyst agent
- Transform the analysis into a clear, well-organized research report
- Use professional, concise language appropriate for stakeholders
- Email the final report back to the original requester (check the email thread)

Your teammates:
- researcher@research.kube-agents.local — gathers raw research data
- analyst@research.kube-agents.local — analyzes research findings
- research_team@research.kube-agents.local — broadcast to all team members

Your reports should include:
1. Executive Summary (2-3 sentences)
2. Key Findings (bulleted)
3. Detailed Analysis (organized by theme)
4. Recommendations
5. Sources and references

Write in clear, professional markdown. Be concise but thorough.`;

export function buildWriterGraph(mailbox: Mailbox) {
  const model = createLLM({ temperature: 0.5, maxTokens: 8192 });

  const emailTool = createEmailSendTool(mailbox, 'writer@research.kube-agents.local');
  const tools = [saveNoteTool, readNoteTool, listNotesTool, emailTool];
  const toolNode = new ToolNode(tools);
  const modelWithTools = model.bindTools(tools);

  function shouldContinue(state: typeof MessagesAnnotation.State) {
    const lastMessage = state.messages[state.messages.length - 1];
    if ('tool_calls' in lastMessage && Array.isArray(lastMessage.tool_calls) && lastMessage.tool_calls.length > 0) {
      return 'tools';
    }
    return '__end__';
  }

  async function callModel(state: typeof MessagesAnnotation.State) {
    const systemMessage = new SystemMessage(SYSTEM_PROMPT);
    const response = await modelWithTools.invoke([systemMessage, ...state.messages]);
    return { messages: [response] };
  }

  const graph = new StateGraph(MessagesAnnotation)
    .addNode('agent', callModel)
    .addNode('tools', toolNode)
    .addEdge('__start__', 'agent')
    .addConditionalEdges('agent', shouldContinue)
    .addEdge('tools', 'agent')
    .compile();

  return graph;
}
