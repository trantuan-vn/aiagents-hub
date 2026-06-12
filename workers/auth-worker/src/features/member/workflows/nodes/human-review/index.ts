import type { WorkflowNodePlugin } from '../types.js';

/** Human review pause/resume is handled in the engine loop, not via execute(). */
export const humanReviewPlugin: WorkflowNodePlugin = {
  id: 'human_review',
  runtimeType: 'human_review',
  engineFlowControl: 'human_review',
  skipExecution: true,
};
