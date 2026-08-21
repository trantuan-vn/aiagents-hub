import {
  HUMAN_REVIEW_CHANNELS,
  type HumanReviewChannel,
} from "@aiagents-hub/workflow-nodes";

import type { WorkflowNodeUIPlugin } from "../types";
import { HumanReviewNode } from "./canvas";
import {
  GmailHumanReviewConfigPanel,
  gmailHumanReviewDefaults,
  HUMAN_REVIEW_GMAIL_N8N_DESCRIPTION,
  isGmailHumanReviewNode,
} from "./gmail";

export { HumanReviewNode } from "./canvas";
export {
  GmailHumanReviewConfigPanel,
  GmailCredentialDialog,
  gmailHumanReviewDefaults,
  HUMAN_REVIEW_GMAIL_N8N_DESCRIPTION,
  isGmailHumanReviewNode,
} from "./gmail";

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
  if (channel === "gmail") {
    return {
      id: "human_review:gmail",
      runtimeType: "human_review",
      kind: "gmail",
      Canvas: HumanReviewNode,
      ConfigPanel: GmailHumanReviewConfigPanel,
      defaults: () => gmailHumanReviewDefaults(),
      catalog: {
        category: "human",
        labelKey: "human_review_channel_gmail",
        descriptionKey: "human_review_channel_gmail_desc",
        icon: "UserCheck",
        keywords: ["gmail", "email", "human", "review", "approval"],
      },
      n8nProperties: HUMAN_REVIEW_GMAIL_N8N_DESCRIPTION.properties,
      match: isGmailHumanReviewNode,
    };
  }

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
