import type { WorkflowNodePlugin } from '../types.js';
import { executeCore } from './execute.js';

export { executeCore } from './execute.js';

export const corePlugin: WorkflowNodePlugin = {
  id: 'core',
  runtimeType: 'core',
  execute: executeCore,
};
