import {
  defaultInputSection,
  defaultOutputSection,
  defaultParametersSection,
} from "../default-sections";
import { createBuiltin } from "../create-builtin";
import type { WorkflowNodeDefinition } from "../../types/node-definition";
import {
  HUMAN_REVIEW_CHANNELS,
  HUMAN_REVIEW_KIND_FIELD,
  type HumanReviewChannel,
} from "./channels";

export {
  HUMAN_REVIEW_CHANNELS,
  HUMAN_REVIEW_KIND_FIELD,
  type HumanReviewChannel,
} from "./channels";

/** Base family definition — fallback when no channel kind is set. */
export const HUMAN_REVIEW_DEFINITION: WorkflowNodeDefinition = createBuiltin({
  id: "human_review",
  runtimeType: "human_review",
  nameKey: "node_human_review",
  descriptionKey: "node_human_review_desc",
  category: "human",
  icon: "UserCheck",
  sections: [
    defaultInputSection(),
    defaultParametersSection([
      {
        id: HUMAN_REVIEW_KIND_FIELD,
        type: "select",
        labelKey: "field_review_channel",
        defaultValue: "chat",
        options: HUMAN_REVIEW_CHANNELS.map((value) => ({
          value,
          labelKey: `human_review_channel_${value}`,
        })),
        order: 1,
      },
    ]),
    defaultOutputSection(true),
  ],
});

export function createHumanReviewChannelDefinition(
  channel: HumanReviewChannel,
): WorkflowNodeDefinition {
  const isGmail = channel === "gmail";
  return createBuiltin({
    id: `human_review:${channel}`,
    runtimeType: "human_review",
    kind: channel,
    nameKey: `human_review_channel_${channel}`,
    descriptionKey: `human_review_channel_${channel}_desc`,
    category: "human",
    icon: "UserCheck",
    defaultData: isGmail
      ? {
          [HUMAN_REVIEW_KIND_FIELD]: channel,
          label: "Gmail",
          reviewMode: "send_and_wait",
          resource: "message",
          operation: "sendAndWait",
          to: "",
          subject: "",
          message: "",
          responseType: "approval",
          credentialKey: "",
        }
      : {
          [HUMAN_REVIEW_KIND_FIELD]: channel,
          label: channel.replace(/_/g, " "),
        },
    sections: [
      defaultInputSection(),
      defaultParametersSection([
        {
          id: HUMAN_REVIEW_KIND_FIELD,
          type: "select",
          labelKey: "field_review_channel",
          defaultValue: channel,
          options: HUMAN_REVIEW_CHANNELS.map((value) => ({
            value,
            labelKey: `human_review_channel_${value}`,
          })),
          order: 1,
        },
      ]),
      defaultOutputSection(true),
    ],
  });
}

export const HUMAN_REVIEW_CHANNEL_DEFINITIONS: WorkflowNodeDefinition[] =
  HUMAN_REVIEW_CHANNELS.map(createHumanReviewChannelDefinition);
