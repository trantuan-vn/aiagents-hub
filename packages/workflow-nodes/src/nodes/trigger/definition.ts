import {
  defaultInputSection,
  defaultOutputSection,
  defaultParametersSection,
} from "../default-sections";
import { createBuiltin } from "../create-builtin";
import type { WorkflowNodeDefinition } from "../../types/node-definition";

export const TRIGGER_NODE_DEFINITION: WorkflowNodeDefinition = createBuiltin({
  id: "trigger",
  runtimeType: "trigger",
  nameKey: "node_trigger",
  descriptionKey: "node_trigger_desc",
  category: "trigger",
  icon: "Play",
  sections: [
    defaultInputSection(),
    defaultParametersSection([
      {
        id: "triggerKind",
        type: "select",
        labelKey: "field_trigger_kind",
        defaultValue: "manual",
        options: [
          { value: "manual", labelKey: "opt_trigger_manual" },
          { value: "webhook", labelKey: "opt_trigger_webhook" },
          { value: "schedule", labelKey: "opt_trigger_schedule" },
          { value: "form", labelKey: "opt_trigger_form" },
        ],
        order: 1,
      },
    ]),
    defaultOutputSection(false),
  ],
});
