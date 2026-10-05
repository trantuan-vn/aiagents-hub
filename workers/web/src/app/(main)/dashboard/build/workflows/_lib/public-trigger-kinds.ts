/** Entry points community users can start on a shared workflow. Mirrors auth-worker `PUBLIC_TRIGGER_KINDS`. */
export const PUBLIC_TRIGGER_KINDS = ["manual", "chat", "form", "webhook"] as const;
export type PublicTriggerKind = (typeof PUBLIC_TRIGGER_KINDS)[number];

/** Null means every kind is allowed (workflows shared before this setting existed). */
export function parsePublicTriggerKinds(raw: unknown): PublicTriggerKind[] | null {
  if (raw == null || raw === "") return null;
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(value)) return null;
  return PUBLIC_TRIGGER_KINDS.filter((kind) => value.includes(kind));
}

export function serializePublicTriggerKinds(kinds: PublicTriggerKind[] | null): string | null {
  return kinds ? JSON.stringify(PUBLIC_TRIGGER_KINDS.filter((kind) => kinds.includes(kind))) : null;
}

/** Trigger kinds that have at least one node on the canvas. */
export function triggerKindsInDefinition(definitionJson: string): Set<PublicTriggerKind> {
  const kinds = new Set<PublicTriggerKind>();
  let nodes: Array<{ type?: string; data?: Record<string, unknown> }> = [];
  try {
    const parsed = JSON.parse(definitionJson) as { nodes?: unknown };
    if (Array.isArray(parsed.nodes)) nodes = parsed.nodes;
  } catch {
    return kinds;
  }
  for (const node of nodes) {
    const data = node.data ?? {};
    if (data.coreKind === "webhook" || node.type === "webhook") kinds.add("webhook");
    else if (node.type === "trigger" && PUBLIC_TRIGGER_KINDS.includes(data.triggerKind as PublicTriggerKind)) {
      kinds.add(data.triggerKind as PublicTriggerKind);
    }
  }
  return kinds;
}
