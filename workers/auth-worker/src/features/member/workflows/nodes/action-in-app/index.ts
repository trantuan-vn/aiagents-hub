import type { WorkflowNodePlugin } from '../types.js';
import { executeActionInApp } from './execute.js';

export { executeActionInApp } from './execute.js';

export const actionInAppPlugin: WorkflowNodePlugin = {
  id: 'action_in_app',
  runtimeType: 'action_in_app',
  execute: executeActionInApp,
};
