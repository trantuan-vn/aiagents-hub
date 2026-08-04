import {
  defaultInputSection,
  defaultOutputSection,
  defaultParametersSection,
} from "../default-sections";
import { createBuiltin } from "../create-builtin";
import type { WorkflowNodeDefinition } from "../../types/node-definition";

export const ACTION_IN_APP_DEFINITION: WorkflowNodeDefinition = createBuiltin({
  id: "action_in_app",
  runtimeType: "action_in_app",
  nameKey: "node_action",
  descriptionKey: "node_action_desc",
  category: "action",
  icon: "Zap",
  sections: [
    defaultInputSection(),
    defaultParametersSection([
      {
        id: "integrationId",
        type: "text",
        labelKey: "field_integration",
        order: 1,
      },
      {
        id: "actionId",
        type: "text",
        labelKey: "field_action",
        order: 2,
      },
    ]),
    defaultOutputSection(true),
  ],
});
