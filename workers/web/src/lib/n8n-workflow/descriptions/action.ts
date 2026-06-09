import { mainFlowNode } from "./common";

export const ACTION_IN_APP_N8N_DESCRIPTION = mainFlowNode({
  displayName: "Action in App",
  name: "action_in_app",
  icon: "fa:bolt",
  group: ["transform"],
  description: "Runs an integration action in a connected app.",
  properties: [
    {
      displayName: "Integration",
      name: "integrationId",
      type: "string",
      default: "",
    },
    {
      displayName: "Action",
      name: "actionId",
      type: "string",
      default: "",
    },
    {
      displayName: "Label",
      name: "label",
      type: "string",
      default: "Action",
    },
  ],
});
