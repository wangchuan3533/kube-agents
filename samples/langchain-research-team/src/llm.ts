/**
 * Shared LLM factory — creates an Azure OpenAI chat model from environment variables.
 *
 * Environment variables:
 *   AZURE_OPENAI_API_KEY     — Azure OpenAI subscription key (required)
 *   AZURE_OPENAI_ENDPOINT    — Azure endpoint URL (required)
 *   AZURE_OPENAI_DEPLOYMENT  — Deployment name (default: gpt-5.4)
 *   AZURE_OPENAI_API_VERSION — API version (default: 2024-12-01-preview)
 */
import { AzureChatOpenAI } from '@langchain/openai';

export function createLLM(opts?: { temperature?: number; maxTokens?: number }) {
  return new AzureChatOpenAI({
    azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
    azureOpenAIApiInstanceName: undefined,
    azureOpenAIEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
    azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-5.4',
    azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION ?? '2024-12-01-preview',
    temperature: opts?.temperature ?? 0.3,
    maxTokens: opts?.maxTokens ?? 4096,
  });
}
