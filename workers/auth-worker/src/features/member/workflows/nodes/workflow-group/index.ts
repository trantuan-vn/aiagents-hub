import type { WorkflowNodePlugin } from '../types.js';

/** Visual group container — canvas-only. */
export const workflowGroupPlugin: WorkflowNodePlugin = {
  id: 'workflow_group',
  runtimeType: 'workflow_group',
  skipExecution: true,
};
