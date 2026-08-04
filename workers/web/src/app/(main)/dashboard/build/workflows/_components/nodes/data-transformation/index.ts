import type { WorkflowNodeUIPlugin } from "../types";
import { TransformNode } from "./canvas";

export { TransformNode } from "./canvas";

export const dataTransformationUIPlugin: WorkflowNodeUIPlugin = {
  id: "data_transformation",
  runtimeType: "data_transformation",
  Canvas: TransformNode,
  defaults: () => ({ label: "Data transformation" }),
  catalog: {
    category: "transform",
    labelKey: "node_transform",
    descriptionKey: "node_transform_desc",
    icon: "Wrench",
  },
};
