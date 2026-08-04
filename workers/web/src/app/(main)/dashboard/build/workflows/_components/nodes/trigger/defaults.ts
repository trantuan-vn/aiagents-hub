export function triggerDefaults(idSuffix?: string): Record<string, unknown> {
  return {
    label: "Trigger",
    triggerKind: "manual",
    ...(idSuffix ? { _seed: idSuffix } : {}),
  };
}
