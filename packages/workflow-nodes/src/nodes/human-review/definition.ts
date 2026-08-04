import {
  defaultInputSection,
  defaultOutputSection,
  defaultParametersSection,
} from "../default-sections";
import { createBuiltin } from "../create-builtin";
import type { WorkflowNodeDefinition } from "../../types/node-definition";

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
        id: "channel",
        type: "select",
        labelKey: "field_review_channel",
        defaultValue: "email",
        options: [
          { value: "email", labelKey: "opt_review_email" },
          { value: "slack", labelKey: "opt_review_slack" },
        ],
        order: 1,
      },
    ]),
    defaultOutputSection(true),
  ],
});
