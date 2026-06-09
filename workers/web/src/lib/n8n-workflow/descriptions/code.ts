import { mainFlowNode } from "./common";

export const CODE_N8N_DESCRIPTION = mainFlowNode({
  displayName: "Code",
  name: "code",
  icon: "fa:code",
  group: ["transform"],
  description: "Transform data using safe template interpolation (Workers-safe, no eval).",
  properties: [
    {
      displayName: "Mode",
      name: "mode",
      type: "options",
      default: "template",
      options: [
        { name: "Template", value: "template" },
        { name: "JSON transform", value: "json" },
      ],
    },
    {
      displayName: "Language",
      name: "language",
      type: "options",
      default: "javascript",
      options: [
        { name: "JavaScript", value: "javascript" },
        { name: "Python (display only)", value: "python" },
      ],
    },
    {
      displayName: "Code / template",
      name: "code",
      type: "string",
      typeOptions: { rows: 8 },
      default: "{{ text }}",
      description: "Use {{ path.to.field }} to reference upstream data",
    },
    {
      displayName: "Label",
      name: "label",
      type: "string",
      default: "Code",
    },
  ],
});
