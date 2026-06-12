import type { WorkflowNodePlugin } from '../types.js';

/**
 * Template plugin — copy to `nodes/<name>/index.ts` and wire execute/trigger.
 */
export const templatePlugin: WorkflowNodePlugin = {
  id: 'template',
  runtimeType: 'core',
  kind: 'template',
};
