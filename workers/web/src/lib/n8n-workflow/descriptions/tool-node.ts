import { resourceNode } from "./common";

export const TOOL_NODE_N8N_DESCRIPTION = resourceNode({
  displayName: "Tool",
  name: "tool_node",
  icon: "fa:wrench",
  group: ["transform"],
  description: "Tool definition — connect to an Agent node's Tools input.",
  properties: [
    {
      displayName: "Tool kind",
      name: "toolKind",
      type: "options",
      default: "http-request",
      options: [
        { name: "HTTP Request", value: "http-request" },
        { name: "Code", value: "code" },
      ],
    },
    {
      displayName: "URL",
      name: "url",
      type: "string",
      default: "",
      displayOptions: { show: { toolKind: ["http-request"] } },
    },
    {
      displayName: "Code",
      name: "code",
      type: "string",
      typeOptions: { rows: 4 },
      default: "",
      displayOptions: { show: { toolKind: ["code"] } },
    },
    {
      displayName: "Label",
      name: "label",
      type: "string",
      default: "Tool",
    },
  ],
});
