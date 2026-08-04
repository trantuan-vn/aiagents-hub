import {
  defaultInputSection,
  defaultOutputSection,
  defaultParametersSection,
} from "../default-sections";
import { createBuiltin } from "../create-builtin";
import type { WorkflowNodeDefinition } from "../../types/node-definition";

export const DATA_TRANSFORMATION_DEFINITION: WorkflowNodeDefinition = createBuiltin({
  id: "data_transformation",
  runtimeType: "data_transformation",
  nameKey: "node_transform",
  descriptionKey: "node_transform_desc",
  category: "action",
  icon: "Wrench",
  sections: [
    defaultInputSection(),
    defaultParametersSection([
      {
        id: "mode",
        type: "select",
        labelKey: "field_transform_mode",
        defaultValue: "manual",
        options: [
          { value: "manual", labelKey: "opt_transform_manual" },
          { value: "auto", labelKey: "opt_transform_auto" },
        ],
        order: 1,
      },
    ]),
    defaultOutputSection(true),
  ],
});
