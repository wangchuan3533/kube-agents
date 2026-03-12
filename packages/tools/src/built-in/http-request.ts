import type { RegisteredTool } from '../tool-registry.js';

const DEFAULT_TIMEOUT = 30_000;

export const httpRequestTool: RegisteredTool = {
  definition: {
    name: 'http-request',
    description: 'Make an HTTP request and return the response',
    parameters: {
      url: {
        type: 'string',
        description: 'The URL to request',
        required: true,
      },
      method: {
        type: 'string',
        description: 'HTTP method (GET, POST, PUT, DELETE). Default: GET',
        required: false,
      },
      body: {
        type: 'string',
        description: 'Request body (for POST/PUT)',
        required: false,
      },
    },
  },
  execute: async (args) => {
    const url = args['url'] as string;
    const method = (args['method'] as string) ?? 'GET';
    const body = args['body'] as string | undefined;

    const response = await fetch(url, {
      method,
      ...(body ? { body, headers: { 'Content-Type': 'application/json' } } : {}),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
    });

    const text = await response.text();
    return `HTTP ${response.status} ${response.statusText}\n\n${text}`;
  },
};
