import { readFile } from 'node:fs/promises';
import type { RegisteredTool } from '../tool-registry.js';

export const fileReadTool: RegisteredTool = {
  definition: {
    name: 'file-read',
    description: 'Read the contents of a file at the given path',
    parameters: {
      path: {
        type: 'string',
        description: 'Absolute path to the file to read',
        required: true,
      },
    },
  },
  execute: async (args) => {
    const path = args['path'] as string;
    return await readFile(path, 'utf-8');
  },
};
