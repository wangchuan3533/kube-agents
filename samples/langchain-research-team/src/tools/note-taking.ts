/**
 * In-memory note-taking tool — lets agents store and retrieve research notes.
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const notes = new Map<string, string>();

export const saveNoteTool = tool(
  async ({ key, content }) => {
    notes.set(key, content);
    return `Note saved under key "${key}"`;
  },
  {
    name: 'save_note',
    description: 'Save a research note for later reference.',
    schema: z.object({
      key: z.string().describe('A short key to identify the note'),
      content: z.string().describe('The note content'),
    }),
  },
);

export const readNoteTool = tool(
  async ({ key }) => {
    const content = notes.get(key);
    return content ?? `No note found with key "${key}"`;
  },
  {
    name: 'read_note',
    description: 'Read a previously saved research note.',
    schema: z.object({
      key: z.string().describe('The key of the note to read'),
    }),
  },
);

export const listNotesTool = tool(
  async () => {
    if (notes.size === 0) return 'No notes saved yet.';
    return Array.from(notes.keys()).join(', ');
  },
  {
    name: 'list_notes',
    description: 'List all saved note keys.',
    schema: z.object({}),
  },
);
