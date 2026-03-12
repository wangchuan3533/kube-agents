import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { RegisteredTool } from '../tool-registry.js';

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT = 30_000;
const MAX_OUTPUT_LENGTH = 100_000;

export const shellExecTool: RegisteredTool = {
  definition: {
    name: 'shell-exec',
    description: 'Execute a shell command and return its output',
    parameters: {
      command: {
        type: 'string',
        description: 'The command to execute',
        required: true,
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 30000)',
        required: false,
      },
    },
  },
  execute: async (args) => {
    const command = args['command'] as string;
    const timeout = (args['timeout'] as number) ?? DEFAULT_TIMEOUT;

    const { stdout, stderr } = await execFileAsync('sh', ['-c', command], {
      timeout,
      maxBuffer: MAX_OUTPUT_LENGTH,
    });

    const output = [
      stdout ? `stdout:\n${stdout}` : '',
      stderr ? `stderr:\n${stderr}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    return output || '(no output)';
  },
};
