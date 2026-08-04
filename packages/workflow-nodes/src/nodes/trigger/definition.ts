import {
  defaultInputSection,
  defaultOutputSection,
  defaultParametersSection,
} from "../default-sections";
import { createBuiltin } from "../create-builtin";
import type { WorkflowNodeDefinition } from "../../types/node-definition";
import {
  TRIGGER_KIND_FIELD,
  TRIGGER_KINDS,
  TRIGGER_OVERRIDE_KINDS,
  type TriggerKind,
} from "./kinds";

export {
  TRIGGER_KIND_FIELD,
  TRIGGER_KINDS,
  TRIGGER_OVERRIDE_KINDS,
  type TriggerKind,
} from "./kinds";

/** Base family definition — fallback when no triggerKind is set. */
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
        id: TRIGGER_KIND_FIELD,
        type: "select",
        labelKey: "field_trigger_kind",
        defaultValue: "manual",
        options: TRIGGER_KINDS.map((value) => ({
          value,
          labelKey: `trigger_kind_${value}`,
        })),
        order: 1,
      },
    ]),
    defaultOutputSection(false),
  ],
});

export function createTriggerKindDefinition(kind: TriggerKind): WorkflowNodeDefinition {
  return createBuiltin({
    id: `trigger:${kind}`,
    runtimeType: "trigger",
    kind,
    nameKey: `trigger_kind_${kind}`,
    descriptionKey: `trigger_kind_${kind}_desc`,
    category: "trigger",
    icon: "Play",
    defaultData: {
      [TRIGGER_KIND_FIELD]: kind,
      label: kind.replace(/_/g, " "),
    },
    sections: [
      defaultInputSection(),
      defaultParametersSection([
        {
          id: TRIGGER_KIND_FIELD,
          type: "select",
          labelKey: "field_trigger_kind",
          defaultValue: kind,
          options: TRIGGER_KINDS.map((value) => ({
            value,
            labelKey: `trigger_kind_${value}`,
          })),
          order: 1,
        },
      ]),
      defaultOutputSection(false),
    ],
  });
}

/** Factory definitions for kinds without dedicated override modules. */
export const TRIGGER_KIND_DEFINITIONS: WorkflowNodeDefinition[] = TRIGGER_KINDS.filter(
  (kind) => !TRIGGER_OVERRIDE_KINDS.has(kind),
).map(createTriggerKindDefinition);
