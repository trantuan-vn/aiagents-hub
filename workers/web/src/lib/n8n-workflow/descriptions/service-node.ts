import { resourceNode } from "./common";

export const SERVICE_NODE_N8N_DESCRIPTION = resourceNode({
  displayName: "Service",
  name: "service_node",
  icon: "fa:server",
  group: ["transform"],
  description: "Approved AI service — connect to an Agent node's Service input.",
  properties: [
    {
      displayName: "Service",
      name: "endpoint",
      type: "string",
      default: "",
      required: true,
      description: "Approved AI service endpoint",
      typeOptions: { aiHubServiceSelect: true },
    },
    {
      displayName: "Catalog ID",
      name: "catalogId",
      type: "string",
      default: "",
    },
    {
      displayName: "Label",
      name: "label",
      type: "string",
      default: "Service",
    },
  ],
});
