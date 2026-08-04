import {
  TRIGGER_KINDS,
  TRIGGER_OVERRIDE_KINDS,
  type TriggerKind,
} from "@aiagents-hub/workflow-nodes";

import type { WorkflowNodeUIPlugin } from "../types";
import { TriggerNode } from "./canvas";
import { triggerDefaults } from "./defaults";

export { TriggerNode } from "./canvas";
export { triggerDefaults } from "./defaults";

/** Base family plugin — hidden from catalog; kind plugins are the add-node entries. */
export const triggerUIPlugin: WorkflowNodeUIPlugin = {
  id: "trigger",
  runtimeType: "trigger",
  Canvas: TriggerNode,
  defaults: () => triggerDefaults(),
  catalog: {
    category: "trigger",
    labelKey: "node_trigger",
    descriptionKey: "node_trigger_desc",
    icon: "Play",
    visible: false,
  },
};

export function createTriggerKindUIPlugin(kind: TriggerKind): WorkflowNodeUIPlugin {
  const label = kind.replace(/_/g, " ");
  return {
    id: `trigger:${kind}`,
    runtimeType: "trigger",
    kind,
    Canvas: TriggerNode,
    defaults: () => ({
      label,
      triggerKind: kind,
    }),
    catalog: {
      category: "trigger",
      labelKey: `trigger_kind_${kind}`,
      descriptionKey: `trigger_kind_${kind}_desc`,
      icon: "Play",
      keywords: [kind, "trigger"],
    },
  };
}

/** Factory plugins for kinds without dedicated override modules (skips webhook). */
export const TRIGGER_KIND_UI_PLUGINS: WorkflowNodeUIPlugin[] = TRIGGER_KINDS.filter(
  (kind) => !TRIGGER_OVERRIDE_KINDS.has(kind),
).map(createTriggerKindUIPlugin);
