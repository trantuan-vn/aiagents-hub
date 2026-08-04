import {
  defaultInputSection,
  defaultOutputSection,
  defaultParametersSection,
} from "../default-sections";
import { createBuiltin } from "../create-builtin";
import type { WorkflowNodeDefinition } from "../../types/node-definition";

export const SERVICE_NODE_DEFINITION: WorkflowNodeDefinition = createBuiltin({
  id: "service_node",
  runtimeType: "service_node",
  nameKey: "node_service",
  descriptionKey: "node_service_desc",
  category: "resource",
  icon: "Server",
  sections: [
    defaultInputSection(),
    defaultParametersSection([
      { id: "catalogId", type: "text", labelKey: "field_service_catalog", order: 1 },
      { id: "endpoint", type: "text", labelKey: "field_service_endpoint", order: 2 },
    ]),
    defaultOutputSection(false),
  ],
});
