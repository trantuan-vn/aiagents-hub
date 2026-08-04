import type { WorkflowNodePlugin } from '../types.js';
import { executeTrigger } from './execute.js';

export { executeTrigger } from './execute.js';

export const triggerPlugin: WorkflowNodePlugin = {
  id: 'trigger',
  runtimeType: 'trigger',
  execute: executeTrigger,
};
