import { mainFlowNode } from "./common";

/** n8n Filter — conditions + convert types + options collection. */
export const FILTER_N8N_DESCRIPTION = mainFlowNode({
  displayName: "Filter",
  name: "filter",
  icon: "fa:filter",
  group: ["transform"],
  description: "Keep only items matching a condition.",
  properties: [
    {
      displayName: "Conditions",
      name: "conditions",
      placeholder: "Add condition",
      type: "filter",
      default: {},
    },
    {
      displayName: "Convert types where required",
      name: "looseTypeValidation",
      type: "boolean",
      default: false,
      noDataExpression: true,
      description:
        'If the type of an expression doesn\'t match the type of the comparison, try to cast it. E.g. for booleans "false" or 0 will be cast to false.',
    },
    {
      displayName: "Options",
      name: "options",
      type: "collection",
      placeholder: "Add option",
      default: {},
      options: [
        {
          displayName: "Ignore Case",
          name: "ignoreCase",
          type: "boolean",
          default: true,
          description: "Whether to ignore letter case when evaluating conditions",
        },
      ],
    },
  ],
});
