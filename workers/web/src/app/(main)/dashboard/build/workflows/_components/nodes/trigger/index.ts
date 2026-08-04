import type { WorkflowNodeUIPlugin } from "../types";
import { TriggerNode } from "./canvas";
import { triggerDefaults } from "./defaults";

export { TriggerNode } from "./canvas";
export { triggerDefaults } from "./defaults";

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
  },
};
