import type { WorkflowNodePlugin } from '../types.js';
import { executeFlow } from './execute.js';

export { executeFlow } from './execute.js';

export const flowPlugin: WorkflowNodePlugin = {
  id: 'flow',
  runtimeType: 'flow',
  execute: executeFlow,
};
