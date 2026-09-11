import {
  TRIGGER_KINDS,
  TRIGGER_OVERRIDE_KINDS,
  type TriggerKind,
} from "@aiagents-hub/workflow-nodes";

import type { WorkflowNodeUIPlugin } from "../types";
import { TriggerNode } from "./canvas";
import { isManualTriggerNode, ManualTriggerConfigPanel } from "./config-panel";
import { scheduleTriggerDefaults, triggerDefaults } from "./defaults";
import { isScheduleTriggerNode, ScheduleTriggerConfigPanel } from "./schedule-config-panel";

export { TriggerNode };
export { scheduleTriggerDefaults, triggerDefaults };
export { isManualTriggerNode, ManualTriggerConfigPanel };
export { isScheduleTriggerNode, ScheduleTriggerConfigPanel };

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

export const manualTriggerUIPlugin: WorkflowNodeUIPlugin = {
  id: "trigger:manual",
  runtimeType: "trigger",
  kind: "manual",
  Canvas: TriggerNode,
  ConfigPanel: ManualTriggerConfigPanel,
  defaults: () => triggerDefaults(),
  catalog: {
    category: "trigger",
    labelKey: "trigger_kind_manual",
    descriptionKey: "trigger_kind_manual_desc",
    icon: "MousePointerClick",
    keywords: ["manual", "trigger", "execute"],
  },
  match: (node) => isManualTriggerNode(node),
};

export const scheduleTriggerUIPlugin: WorkflowNodeUIPlugin = {
  id: "trigger:schedule",
  runtimeType: "trigger",
  kind: "schedule",
  Canvas: TriggerNode,
  ConfigPanel: ScheduleTriggerConfigPanel,
  defaults: () => scheduleTriggerDefaults(),
  catalog: {
    category: "trigger",
    labelKey: "trigger_kind_schedule",
    descriptionKey: "trigger_kind_schedule_desc",
    icon: "Clock",
    keywords: ["schedule", "cron", "interval", "trigger"],
  },
  match: (node) => isScheduleTriggerNode(node),
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

/** Factory plugins for kinds without dedicated override modules (skips webhook/form/manual/schedule). */
export const TRIGGER_KIND_UI_PLUGINS: WorkflowNodeUIPlugin[] = TRIGGER_KINDS.filter(
  (kind) => !TRIGGER_OVERRIDE_KINDS.has(kind) && kind !== "manual",
).map(createTriggerKindUIPlugin);
