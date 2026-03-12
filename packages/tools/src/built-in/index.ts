import type { RegisteredTool } from '../tool-registry.js';
import { fileReadTool } from './file-read.js';
import { fileWriteTool } from './file-write.js';
import { shellExecTool } from './shell-exec.js';
import { httpRequestTool } from './http-request.js';

export const BUILT_IN_TOOLS: RegisteredTool[] = [
  fileReadTool,
  fileWriteTool,
  shellExecTool,
  httpRequestTool,
];

export { fileReadTool, fileWriteTool, shellExecTool, httpRequestTool };
