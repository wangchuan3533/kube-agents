/**
 * Analyst Agent — receives research findings, analyzes them,
 * and forwards structured analysis to the writer agent.
 */
import { StateGraph, MessagesAnnotation } from '@langchain/langgraph';
import { SystemMessage } from '@langchain/core/messages';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import type { Mailbox } from '@kube-agents/mail';
import { createLLM } from '../llm.js';
import { saveNoteTool, readNoteTool, listNotesTool } from '../tools/note-taking.js';
import { createEmailSendTool } from '../tools/email-send.js';

const SYSTEM_PROMPT = `You are an Analyst Agent in a multi-agent research team.

Your role:
- Receive research findings from the researcher agent
- Analyze the data: identify patterns, trends, key insights, and gaps
- Save your analysis as structured notes
- When analysis is complete, email a structured analysis to the writer agent at writer@research.kube-agents.local

Your teammates:
- researcher@research.kube-agents.local — gathers raw research data
- writer@research.kube-agents.local — writes final reports from your analysis
- research_team@research.kube-agents.local — broadcast to all team members

Your analysis should include:
1. Key findings summary
2. Identified trends and patterns
3. Notable data points with supporting evidence
4. Gaps or areas needing further research
5. Recommended conclusions`;

export function buildAnalystGraph(mailbox: Mailbox) {
  const model = createLLM({ temperature: 0.2, maxTokens: 4096 });

  const emailTool = createEmailSendTool(mailbox, 'analyst@research.kube-agents.local');
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
