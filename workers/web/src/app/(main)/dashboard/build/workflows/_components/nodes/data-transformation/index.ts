import {
  TRANSFORM_KINDS,
  TRANSFORM_OVERRIDE_KINDS,
  type TransformKind,
} from "@aiagents-hub/workflow-nodes";

import type { WorkflowNodeUIPlugin } from "../types";
import { TransformNode } from "./canvas";

export { TransformNode } from "./canvas";

/** Base family plugin — hidden from catalog; kind plugins are the add-node entries. */
export const dataTransformationUIPlugin: WorkflowNodeUIPlugin = {
  id: "data_transformation",
  runtimeType: "data_transformation",
  Canvas: TransformNode,
  defaults: () => ({ label: "Data transformation", transformKind: "edit_fields", mode: "manual" }),
  catalog: {
    category: "transform",
    labelKey: "node_transform",
    descriptionKey: "node_transform_desc",
    icon: "Wrench",
    visible: false,
  },
};

export function createTransformKindUIPlugin(kind: TransformKind): WorkflowNodeUIPlugin {
  const label = kind.replace(/_/g, " ");
  return {
    id: `data_transformation:${kind}`,
    runtimeType: "data_transformation",
    kind,
    Canvas: TransformNode,
    defaults: () => ({
      label,
      transformKind: kind,
      mode: "manual",
    }),
    catalog: {
      category: "transform",
      labelKey: `transform_kind_${kind}`,
      descriptionKey: `transform_kind_${kind}_desc`,
      icon: "Wrench",
      keywords: [kind, "transform"],
    },
  };
}

export const TRANSFORM_KIND_UI_PLUGINS: WorkflowNodeUIPlugin[] = TRANSFORM_KINDS.filter(
  (kind) => !TRANSFORM_OVERRIDE_KINDS.has(kind),
).map(createTransformKindUIPlugin);
