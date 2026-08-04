import type { WorkflowNodePlugin } from '../types.js';

/** Memory/vectorize resource node — attached to agents; not executed on the main path. */
export const memoryNodePlugin: WorkflowNodePlugin = {
  id: 'memory_node',
  runtimeType: 'memory_node',
  skipExecution: true,
};
