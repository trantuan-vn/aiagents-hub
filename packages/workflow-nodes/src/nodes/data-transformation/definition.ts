import {
  defaultInputSection,
  defaultOutputSection,
  defaultParametersSection,
} from "../default-sections";
import { createBuiltin } from "../create-builtin";
import type { WorkflowNodeDefinition } from "../../types/node-definition";
import {
  TRANSFORM_KIND_FIELD,
  TRANSFORM_KINDS,
  TRANSFORM_OVERRIDE_KINDS,
  type TransformKind,
} from "./kinds";

export {
  TRANSFORM_KIND_FIELD,
  TRANSFORM_KINDS,
  TRANSFORM_OVERRIDE_KINDS,
  type TransformKind,
} from "./kinds";

/** Base family definition — fallback when no transformKind is set. */
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
        id: TRANSFORM_KIND_FIELD,
        type: "select",
        labelKey: "field_transform_kind",
        defaultValue: "edit_fields",
        options: TRANSFORM_KINDS.map((value) => ({
          value,
          labelKey: `transform_kind_${value}`,
        })),
        order: 1,
      },
      {
        id: "mode",
        type: "select",
        labelKey: "field_transform_mode",
        defaultValue: "manual",
        options: [
          { value: "manual", labelKey: "opt_transform_manual" },
          { value: "auto", labelKey: "opt_transform_auto" },
        ],
        order: 2,
      },
    ]),
    defaultOutputSection(true),
  ],
});

export function createTransformKindDefinition(kind: TransformKind): WorkflowNodeDefinition {
  return createBuiltin({
    id: `data_transformation:${kind}`,
    runtimeType: "data_transformation",
    kind,
    nameKey: `transform_kind_${kind}`,
    descriptionKey: `transform_kind_${kind}_desc`,
    category: "action",
    icon: "Wrench",
    defaultData: {
      [TRANSFORM_KIND_FIELD]: kind,
      label: kind.replace(/_/g, " "),
      mode: "manual",
    },
    sections: [
      defaultInputSection(),
      defaultParametersSection([
        {
          id: TRANSFORM_KIND_FIELD,
          type: "select",
          labelKey: "field_transform_kind",
          defaultValue: kind,
          options: TRANSFORM_KINDS.map((value) => ({
            value,
            labelKey: `transform_kind_${value}`,
          })),
          order: 1,
        },
        {
          id: "mode",
          type: "select",
          labelKey: "field_transform_mode",
          defaultValue: "manual",
          options: [
            { value: "manual", labelKey: "opt_transform_manual" },
            { value: "auto", labelKey: "opt_transform_auto" },
          ],
          order: 2,
        },
      ]),
      defaultOutputSection(true),
    ],
  });
}

/** Factory definitions for kinds without dedicated override modules. */
export const TRANSFORM_KIND_DEFINITIONS: WorkflowNodeDefinition[] = TRANSFORM_KINDS.filter(
  (kind) => !TRANSFORM_OVERRIDE_KINDS.has(kind),
).map(createTransformKindDefinition);
