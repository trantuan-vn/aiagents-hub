import {
  defaultInputSection,
  defaultOutputSection,
  defaultParametersSection,
} from "../default-sections";
import { createBuiltin } from "../create-builtin";
import type { WorkflowNodeDefinition } from "../../types/node-definition";

export const FLOW_NODE_DEFINITION: WorkflowNodeDefinition = createBuiltin({
  id: "flow",
  runtimeType: "flow",
  nameKey: "node_flow",
  descriptionKey: "node_flow_desc",
  category: "core",
  icon: "GitBranch",
  sections: [
    defaultInputSection(),
    defaultParametersSection([
      {
        id: "flowKind",
        type: "select",
        labelKey: "field_flow_kind",
        defaultValue: "if",
        options: [
          { value: "if", labelKey: "opt_flow_if" },
          { value: "merge", labelKey: "opt_flow_merge" },
          { value: "switch", labelKey: "opt_flow_switch" },
        ],
        order: 1,
      },
    ]),
    defaultOutputSection(true),
  ],
});

export const FLOW_LOOP_OVER_ITEMS_DEFINITION: WorkflowNodeDefinition = createBuiltin({
  id: "flow:loop_over_items",
  runtimeType: "flow",
  kind: "loop_over_items",
  nameKey: "flow_kind_loop_over_items",
  descriptionKey: "flow_kind_loop_over_items_desc",
  category: "flow",
  icon: "RotateCw",
  sections: [
    defaultInputSection(),
    defaultParametersSection([
      {
        id: "batchSize",
        type: "number",
        labelKey: "field_batch_size",
        defaultValue: 1,
        order: 1,
      },
    ]),
    defaultOutputSection(true),
  ],
});
