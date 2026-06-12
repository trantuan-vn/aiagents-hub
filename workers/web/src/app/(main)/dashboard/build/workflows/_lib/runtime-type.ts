import type { Node } from "@xyflow/react";

/** Legacy kind field names stored in node.data */
const KIND_FIELDS = ["coreKind", "flowKind", "triggerKind"] as const;

export type RuntimeTypeWarning = {
  nodeId: string;
  message: string;
  suggestion: string;
};

/**
 * Phase 5: detect legacy `type: "core" + coreKind` patterns that should migrate
 * to direct runtimeType (e.g. `type: "http_request"`).
 */
export function detectLegacyRuntimeType(node: Node): RuntimeTypeWarning | null {
  if (node.type !== "core") return null;
  const data = (node.data ?? {}) as Record<string, unknown>;
  const coreKind = data.coreKind;
  if (typeof coreKind !== "string" || !coreKind) return null;

  const directTypes = new Set(["http_request", "code", "webhook"]);
  if (!directTypes.has(coreKind)) return null;

  return {
    nodeId: node.id,
    message: `Node uses legacy type "core" with coreKind "${coreKind}"`,
    suggestion: `Prefer type "${coreKind}" directly (Phase 5 migration)`,
  };
}

/** Scan all nodes in a definition for legacy runtime type patterns. */
export function scanLegacyRuntimeTypes(nodes: Node[]): RuntimeTypeWarning[] {
  return nodes.map(detectLegacyRuntimeType).filter((w): w is RuntimeTypeWarning => w != null);
}

/**
 * Normalize a node toward direct runtimeType when safe (non-destructive read helper).
 * Does not mutate — returns a copy with suggested type when legacy pattern detected.
 */
export function normalizeRuntimeType(node: Node): Node {
  const warning = detectLegacyRuntimeType(node);
  if (!warning) return node;

  const data = { ...(node.data as Record<string, unknown>) };
  const coreKind = String(data.coreKind);
  const { coreKind: _removed, ...rest } = data;

  return {
    ...node,
    type: coreKind,
    data: rest,
  };
}

/** Log deprecation warnings once per session in development. */
const warnedNodeIds = new Set<string>();

export function warnLegacyRuntimeType(node: Node): void {
  if (process.env.NODE_ENV !== "development") return;
  const warning = detectLegacyRuntimeType(node);
  if (!warning || warnedNodeIds.has(warning.nodeId)) return;
  warnedNodeIds.add(warning.nodeId);
  console.warn(`[workflow] ${warning.message}. ${warning.suggestion}`);
}

export function getKindFieldForRuntimeType(runtimeType: string): (typeof KIND_FIELDS)[number] | null {
  if (runtimeType === "trigger") return "triggerKind";
  if (runtimeType === "flow") return "flowKind";
  if (runtimeType === "core") return "coreKind";
  return null;
}
