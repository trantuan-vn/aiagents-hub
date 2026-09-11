import { scheduleTriggerDefaultData } from "@aiagents-hub/workflow-nodes";

export function triggerDefaults(idSuffix?: string): Record<string, unknown> {
  return {
    label: "When clicking 'Execute workflow'",
    triggerKind: "manual",
    ...(idSuffix ? { _seed: idSuffix } : {}),
  };
}

export function scheduleTriggerDefaults(): Record<string, unknown> {
  return scheduleTriggerDefaultData();
}

