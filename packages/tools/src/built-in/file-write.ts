import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { RegisteredTool } from '../tool-registry.js';

export const fileWriteTool: RegisteredTool = {
  definition: {
    name: 'file-write',
    description: 'Write content to a file at the given path. Creates parent directories if needed.',
    parameters: {
      path: {
        type: 'string',
        description: 'Absolute path to the file to write',
        required: true,
      },
      content: {
        type: 'string',
        description: 'Content to write to the file',
        required: true,
      },
    },
  },
  execute: async (args) => {
    const path = args['path'] as string;
    const content = args['content'] as string;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, 'utf-8');
    return `File written: ${path}`;
  },
};
