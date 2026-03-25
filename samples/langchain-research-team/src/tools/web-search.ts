/**
 * Simulated web search tool for the sample.
 *
 * In production, replace this with a real search API integration
 * (e.g. Tavily, SerpAPI, or Brave Search via @langchain/community).
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

export const webSearchTool = tool(
  async ({ query }) => {
    // Simulated search results for the sample
    console.log(`[web-search] Searching: ${query}`);
    return JSON.stringify({
      query,
      results: [
        {
          title: `Research findings on: ${query}`,
          snippet: `According to recent studies, ${query} is an active area of research with multiple perspectives. Key findings include advancements in methodology, cross-domain applications, and emerging best practices.`,
          url: `https://example.com/research/${encodeURIComponent(query)}`,
        },
        {
          title: `${query} — Industry Analysis`,
          snippet: `Industry analysis shows growing adoption of ${query}. Market trends indicate a 35% year-over-year growth, driven by enterprise demand and open-source community contributions.`,
          url: `https://example.com/analysis/${encodeURIComponent(query)}`,
        },
      ],
    });
  },
  {
    name: 'web_search',
    description: 'Search the web for information on a topic. Returns relevant search results.',
    schema: z.object({
      query: z.string().describe('The search query'),
    }),
  },
);
