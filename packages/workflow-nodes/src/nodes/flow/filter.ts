import {
  defaultInputSection,
  defaultOutputSection,
  defaultParametersSection,
} from "../default-sections";
import { createBuiltin } from "../create-builtin";
import type { WorkflowNodeDefinition } from "../../types/node-definition";
import { FLOW_KIND_FIELD } from "./kinds";
import { defaultFilterNodeData } from "../filter-conditions";

/** Override — n8n Filter conditions (value1 / operator / value2). */
export const FLOW_FILTER_DEFINITION: WorkflowNodeDefinition = createBuiltin({
  id: "flow:filter",
  runtimeType: "flow",
  kind: "filter",
  nameKey: "flow_kind_filter",
  descriptionKey: "flow_kind_filter_desc",
  category: "flow",
  icon: "ListFilter",
  defaultData: {
    [FLOW_KIND_FIELD]: "filter",
    label: "Filter",
    ...defaultFilterNodeData(),
  },
  sections: [
    defaultInputSection(),
    defaultParametersSection([
      {
        id: "conditions",
        type: "json",
        labelKey: "field_filter_conditions",
        descriptionKey: "field_filter_conditions_desc",
        order: 1,
      },
      {
        id: "looseTypeValidation",
        type: "toggle",
        labelKey: "field_filter_convert_types",
        descriptionKey: "field_filter_convert_types_desc",
        defaultValue: false,
        order: 2,
      },
      {
        id: "options",
        type: "options-group",
        labelKey: "field_options",
        descriptionKey: "field_options_desc",
        order: 3,
      },
    ]),
    defaultOutputSection(true),
  ],
});
