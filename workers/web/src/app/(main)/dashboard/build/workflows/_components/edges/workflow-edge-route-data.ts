/** User-adjustable geometry for workflow edges (persisted in edge.data). */
export interface WorkflowEdgeRouteAdjustments {
  /** Extra vertical padding below nodes for loop-back bottom segment (px). */
  loopPadding?: number;
  /** Horizontal step offset for loop-out smooth-step path (px). */
  loopOutOffset?: number;
  /** Midpoint waypoint offset (x) for default edges (px). */
  offsetX?: number;
  /** Midpoint waypoint offset (y) for default edges (px). */
  offsetY?: number;
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function readEdgeRouteAdjustments(data: unknown): WorkflowEdgeRouteAdjustments {
  if (!data || typeof data !== "object") return {};
  const route = (data as { routeAdjustments?: unknown }).routeAdjustments;
  if (!route || typeof route !== "object") return {};
  const r = route as WorkflowEdgeRouteAdjustments;
  const out: WorkflowEdgeRouteAdjustments = {};
  const loopPadding = readFiniteNumber(r.loopPadding);
  if (loopPadding !== undefined) out.loopPadding = loopPadding;
  const loopOutOffset = readFiniteNumber(r.loopOutOffset);
  if (loopOutOffset !== undefined) out.loopOutOffset = loopOutOffset;
  const offsetX = readFiniteNumber(r.offsetX);
  if (offsetX !== undefined) out.offsetX = offsetX;
  const offsetY = readFiniteNumber(r.offsetY);
  if (offsetY !== undefined) out.offsetY = offsetY;
  return out;
}

export function hasRouteAdjustments(adj: WorkflowEdgeRouteAdjustments): boolean {
  return (
    adj.loopPadding !== undefined ||
    adj.loopOutOffset !== undefined ||
    adj.offsetX !== undefined ||
    adj.offsetY !== undefined
  );
}
