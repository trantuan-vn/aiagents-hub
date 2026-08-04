import {
  HUMAN_REVIEW_CHANNELS,
  type HumanReviewChannel,
} from "@aiagents-hub/workflow-nodes";

import type { WorkflowNodeUIPlugin } from "../types";
import { HumanReviewNode } from "./canvas";

export { HumanReviewNode } from "./canvas";

/** Base family plugin — hidden from catalog; kind plugins are the add-node entries. */
export const humanReviewUIPlugin: WorkflowNodeUIPlugin = {
  id: "human_review",
  runtimeType: "human_review",
  Canvas: HumanReviewNode,
  defaults: () => ({ label: "Human review" }),
  catalog: {
    category: "human",
    labelKey: "node_human_review",
    descriptionKey: "node_human_review_desc",
    icon: "UserCheck",
    visible: false,
  },
};

export function createHumanReviewChannelUIPlugin(
  channel: HumanReviewChannel,
): WorkflowNodeUIPlugin {
  const label = channel.replace(/_/g, " ");
  return {
    id: `human_review:${channel}`,
    runtimeType: "human_review",
    kind: channel,
    Canvas: HumanReviewNode,
    defaults: () => ({
      label,
      channel,
      reviewMode: "send_and_wait",
    }),
    catalog: {
      category: "human",
      labelKey: `human_review_channel_${channel}`,
      descriptionKey: `human_review_channel_${channel}_desc`,
      icon: "UserCheck",
      keywords: [channel, "human", "review", "approval"],
    },
  };
}

export const HUMAN_REVIEW_CHANNEL_UI_PLUGINS: WorkflowNodeUIPlugin[] =
  HUMAN_REVIEW_CHANNELS.map(createHumanReviewChannelUIPlugin);
