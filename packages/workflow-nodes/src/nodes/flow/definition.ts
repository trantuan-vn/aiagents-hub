import {
  defaultInputSection,
  defaultOutputSection,
  defaultParametersSection,
} from "../default-sections";
import { createBuiltin } from "../create-builtin";
import type { WorkflowNodeDefinition } from "../../types/node-definition";
import { FLOW_KIND_FIELD, FLOW_KINDS, FLOW_OVERRIDE_KINDS, type FlowKind } from "./kinds";

export { FLOW_KIND_FIELD, FLOW_KINDS, FLOW_OVERRIDE_KINDS, type FlowKind } from "./kinds";

/** Base family definition — fallback when no flowKind is set. */
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
        id: FLOW_KIND_FIELD,
        type: "select",
        labelKey: "field_flow_kind",
        defaultValue: "if",
        options: FLOW_KINDS.map((value) => ({
          value,
          labelKey: `flow_kind_${value}`,
        })),
        order: 1,
      },
    ]),
    defaultOutputSection(true),
  ],
});

export function createFlowKindDefinition(kind: FlowKind): WorkflowNodeDefinition {
  return createBuiltin({
    id: `flow:${kind}`,
    runtimeType: "flow",
    kind,
    nameKey: `flow_kind_${kind}`,
    descriptionKey: `flow_kind_${kind}_desc`,
    category: "flow",
    icon: "GitBranch",
    defaultData: {
      [FLOW_KIND_FIELD]: kind,
      label: kind.replace(/_/g, " "),
    },
    sections: [
      defaultInputSection(),
      defaultParametersSection([
        {
          id: FLOW_KIND_FIELD,
          type: "select",
          labelKey: "field_flow_kind",
          defaultValue: kind,
          options: FLOW_KINDS.map((value) => ({
            value,
            labelKey: `flow_kind_${value}`,
          })),
          order: 1,
        },
      ]),
      defaultOutputSection(true),
    ],
  });
}

/** Override — richer params for loop_over_items. */
export const FLOW_LOOP_OVER_ITEMS_DEFINITION: WorkflowNodeDefinition = createBuiltin({
  id: "flow:loop_over_items",
  runtimeType: "flow",
  kind: "loop_over_items",
  nameKey: "flow_kind_loop_over_items",
  descriptionKey: "flow_kind_loop_over_items_desc",
  category: "flow",
  icon: "RotateCw",
  defaultData: {
    [FLOW_KIND_FIELD]: "loop_over_items",
    batchSize: 1,
  },
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

/** Factory definitions for kinds without dedicated override modules. */
export const FLOW_KIND_DEFINITIONS: WorkflowNodeDefinition[] = FLOW_KINDS.filter(
  (kind) => !FLOW_OVERRIDE_KINDS.has(kind),
).map(createFlowKindDefinition);
