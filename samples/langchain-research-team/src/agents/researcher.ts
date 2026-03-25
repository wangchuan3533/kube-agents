/**
 * Researcher Agent — uses LangChain to search the web, collect findings,
 * and forward structured research to the analyst agent.
 */
import { StateGraph, MessagesAnnotation } from '@langchain/langgraph';
import { SystemMessage } from '@langchain/core/messages';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import type { Mailbox } from '@kube-agents/mail';
import { createLLM } from '../llm.js';
import { webSearchTool } from '../tools/web-search.js';
import { saveNoteTool, readNoteTool, listNotesTool } from '../tools/note-taking.js';
import { createEmailSendTool } from '../tools/email-send.js';

const SYSTEM_PROMPT = `You are a Research Agent in a multi-agent research team.

Your role:
- Receive research requests via email
- Search the web for relevant information using the web_search tool
- Save key findings as notes using save_note
- When research is complete, email your findings to the analyst agent at analyst@research.kube-agents.local

Your teammates:
- analyst@research.kube-agents.local — analyzes your research findings
- writer@research.kube-agents.local — writes final reports
- research_team@research.kube-agents.local — broadcast to all team members

Always be thorough: search multiple angles, save structured notes, then send a comprehensive summary to the analyst.`;

export function buildResearcherGraph(mailbox: Mailbox) {
  const model = createLLM({ temperature: 0.3, maxTokens: 4096 });

  const emailTool = createEmailSendTool(mailbox, 'researcher@research.kube-agents.local');
  const tools = [webSearchTool, saveNoteTool, readNoteTool, listNotesTool, emailTool];
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
