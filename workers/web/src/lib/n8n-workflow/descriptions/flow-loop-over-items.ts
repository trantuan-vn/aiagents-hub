import { mainFlowNode } from "./common";

/** Loop Over Items (Split in Batches) — n8n-style parameters. */
export const FLOW_LOOP_OVER_ITEMS_N8N_DESCRIPTION = mainFlowNode({
  displayName: "Loop Over Items",
  name: "loopOverItems",
  group: ["transform"],
  description: "Split incoming data into batches and iterate over each batch.",
  properties: [
    {
      displayName: "Map the list from the previous node",
      name: "autoIterateNotice",
      type: "notice",
      default: "",
      typeOptions: { variant: "warning" },
      description:
        "Focus Items field, then drag the orange list chip from INPUT (previous node output). Loop only iterates the array you map — not counts like tableCount.",
    },
    {
      displayName: "Items field",
      name: "itemsField",
      type: "string",
      default: "",
      placeholder: "{{ $json.items }}",
      description: "Drag the list field from INPUT. Example: items → {{ $json.items }}",
    },
    {
      displayName: "Batch Size",
      name: "batchSize",
      type: "number",
      default: 1,
      description: "Number of items to process in each loop iteration.",
      noDataExpression: true,
    },
    {
      displayName: "Options",
      name: "optionsNotice",
      type: "notice",
      default: "",
      description: "No additional properties.",
    },
    {
      displayName: "Label",
      name: "label",
      type: "string",
      default: "Loop Over Items",
    },
  ],
});
