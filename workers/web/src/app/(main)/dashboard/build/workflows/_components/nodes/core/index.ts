import type { WorkflowNodeUIPlugin } from "../types";
import { CoreNode } from "./canvas";

export { CoreNode } from "./canvas";

export const coreUIPlugin: WorkflowNodeUIPlugin = {
  id: "core",
  runtimeType: "core",
  Canvas: CoreNode,
  defaults: () => ({ label: "Core" }),
  catalog: {
    category: "core",
    labelKey: "node_core",
    descriptionKey: "node_core_desc",
    icon: "Layers",
  },
};
