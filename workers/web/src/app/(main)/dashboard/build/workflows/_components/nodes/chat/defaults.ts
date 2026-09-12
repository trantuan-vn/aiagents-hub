import { chatTriggerDefaultData } from "@aiagents-hub/workflow-nodes";

/** Default node.data fields for the chat message trigger. */
export function chatTriggerDefaults(nodeId: string): Record<string, unknown> {
  return chatTriggerDefaultData(nodeId);
}
