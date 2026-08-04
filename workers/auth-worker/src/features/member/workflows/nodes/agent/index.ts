import type { WorkflowNodePlugin } from '../types.js';
import { executeAgent } from './execute.js';

export { executeAgent } from './execute.js';

export const agentPlugin: WorkflowNodePlugin = {
  id: 'agent',
  runtimeType: 'agent',
  execute: executeAgent,
};
