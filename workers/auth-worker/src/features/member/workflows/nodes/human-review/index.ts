import {
  HUMAN_REVIEW_CHANNELS,
  type HumanReviewChannel,
} from '@aiagents-hub/workflow-nodes';

import type { WorkflowNodePlugin } from '../types.js';
import { executeGmailHumanReview } from './gmail/execute.js';

/** Base human_review — pause/resume is handled in the engine loop. */
export const humanReviewPlugin: WorkflowNodePlugin = {
  id: 'human_review',
  runtimeType: 'human_review',
  engineFlowControl: 'human_review',
  skipExecution: true,
};

export function createHumanReviewChannelPlugin(channel: HumanReviewChannel): WorkflowNodePlugin {
  if (channel === 'gmail') {
    return {
      id: 'human_review:gmail',
      runtimeType: 'human_review',
      kind: 'gmail',
      engineFlowControl: 'human_review',
      // Engine still pauses; execute() sends the email first.
      skipExecution: false,
      execute: executeGmailHumanReview,
    };
  }

  return {
    id: `human_review:${channel}`,
    runtimeType: 'human_review',
    kind: channel,
    engineFlowControl: 'human_review',
    skipExecution: true,
  };
}

export const HUMAN_REVIEW_CHANNEL_PLUGINS: WorkflowNodePlugin[] =
  HUMAN_REVIEW_CHANNELS.map(createHumanReviewChannelPlugin);
