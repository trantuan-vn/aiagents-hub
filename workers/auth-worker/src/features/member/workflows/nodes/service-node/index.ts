import type { WorkflowNodePlugin } from '../types.js';

/** Service resource node — attached to agents; not executed on the main path. */
export const serviceNodePlugin: WorkflowNodePlugin = {
  id: 'service_node',
  runtimeType: 'service_node',
  skipExecution: true,
};
