import { mainFlowNode } from "./common";

export const DATA_TRANSFORMATION_N8N_DESCRIPTION = mainFlowNode({
  displayName: "Data Transformation",
  name: "data_transformation",
  icon: "fa:wrench",
  group: ["transform"],
  description: "Shape upstream item data for the next node.",
  properties: [
    {
      displayName: "Mode",
      name: "mode",
      type: "options",
      default: "pick_text",
      options: [
        { name: "Pass text field", value: "pick_text" },
        { name: "Parse JSON from text", value: "json_parse" },
        { name: "Manual mapping", value: "manual" },
      ],
    },
    {
      displayName: "Label",
      name: "label",
      type: "string",
      default: "Transform",
    },
  ],
});
