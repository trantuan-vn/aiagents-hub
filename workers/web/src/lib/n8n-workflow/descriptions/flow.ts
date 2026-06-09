import { mainFlowNode } from "./common";

export const FLOW_N8N_DESCRIPTION = mainFlowNode({
  displayName: "Flow",
  name: "flow",
  icon: "fa:code-branch",
  group: ["transform"],
  description: "Branch, merge, or switch workflow paths.",
  properties: [
    {
      displayName: "Flow kind",
      name: "flowKind",
      type: "options",
      default: "if",
      options: [
        { name: "IF", value: "if" },
        { name: "Merge", value: "merge" },
        { name: "Switch", value: "switch" },
      ],
    },
    {
      displayName: "Condition",
      name: "condition",
      type: "string",
      default: "",
      description: "Expression evaluated against upstream JSON (IF / Switch)",
      typeOptions: { rows: 2 },
      displayOptions: { show: { flowKind: ["if", "switch"] } },
    },
    {
      displayName: "Switch cases",
      name: "switchCases",
      type: "json",
      default: "[]",
      description: 'JSON array of match values, e.g. ["a","b","c"] → case_0, case_1, case_2',
      displayOptions: { show: { flowKind: ["switch"] } },
    },
    {
      displayName: "Merge mode",
      name: "mergeMode",
      type: "options",
      default: "append",
      options: [
        { name: "Append (first input)", value: "append" },
        { name: "Wait for all inputs", value: "wait_all" },
      ],
      displayOptions: { show: { flowKind: ["merge"] } },
    },
    {
      displayName: "Label",
      name: "label",
      type: "string",
      default: "Flow",
    },
  ],
});
