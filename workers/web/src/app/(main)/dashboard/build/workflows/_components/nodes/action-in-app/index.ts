import type { WorkflowNodeUIPlugin } from "../types";
import { ActionNode } from "./canvas";

export { ActionNode } from "./canvas";

export const actionInAppUIPlugin: WorkflowNodeUIPlugin = {
  id: "action_in_app",
  runtimeType: "action_in_app",
  Canvas: ActionNode,
  defaults: () => ({ label: "Action in app" }),
  catalog: {
    category: "action",
    labelKey: "node_action",
    descriptionKey: "node_action_desc",
    icon: "Zap",
  },
};
