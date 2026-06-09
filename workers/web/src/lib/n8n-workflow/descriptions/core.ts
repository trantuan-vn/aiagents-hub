import { mainFlowNode } from "./common";

export const CORE_N8N_DESCRIPTION = mainFlowNode({
  displayName: "Core",
  name: "core",
  icon: "fa:layer-group",
  group: ["transform"],
  description: "Core utilities (variables, identity).",
  properties: [
    {
      displayName: "Operation",
      name: "operation",
      type: "options",
      default: "identity",
      options: [
        { name: "Identity (pass through)", value: "identity" },
        { name: "Set variable", value: "set_variable" },
      ],
    },
    {
      displayName: "Variable key",
      name: "key",
      type: "string",
      default: "",
      displayOptions: { show: { operation: ["set_variable"] } },
    },
    {
      displayName: "Value",
      name: "value",
      type: "string",
      default: "",
      displayOptions: { show: { operation: ["set_variable"] } },
    },
    {
      displayName: "Label",
      name: "label",
      type: "string",
      default: "Core",
    },
  ],
});
