import { getBezierPath, getSmoothStepPath, Position, type EdgeProps, type Node } from "@xyflow/react";

import {
  readEdgeRouteAdjustments,
  type WorkflowEdgeRouteAdjustments,
} from "./workflow-edge-route-data";

export type WorkflowEdgeRoute = "default" | "loop-out" | "loop-back";

export type WorkflowEdgeDragAxis = "x" | "y" | "free";

export type WorkflowEdgeDragHandleId = "loopPadding" | "loopOutOffset" | "midpoint";

export interface WorkflowEdgeDragHandle {
  id: WorkflowEdgeDragHandleId;
  x: number;
  y: number;
  axis: WorkflowEdgeDragAxis;
}

const LOOP_PADDING = 48;
const LOOP_CORNER = 12;
const LOOP_OUT_OFFSET = 28;
const MIN_LOOP_PADDING = 20;
const MAX_LOOP_PADDING = 220;
const MIN_LOOP_OUT_OFFSET = 12;
const MAX_LOOP_OUT_OFFSET = 160;

export function isLoopOverItemsNode(node: Node | undefined): boolean {
  if (!node || node.type !== "flow") return false;
  return String((node.data as { flowKind?: string })?.flowKind ?? "") === "loop_over_items";
}

export function classifyWorkflowEdgeRoute(
  props: Pick<EdgeProps, "source" | "target" | "sourceHandleId" | "targetHandleId" | "sourceY" | "targetY" | "sourceX" | "targetX">,
  nodes: Node[],
): WorkflowEdgeRoute {
  const sourceNode = nodes.find((n) => n.id === props.source);
  const targetNode = nodes.find((n) => n.id === props.target);
  const sourceHandle = props.sourceHandleId;
  const targetHandle = props.targetHandleId;

  if (isLoopOverItemsNode(sourceNode) && sourceHandle === "loop") {
    return "loop-out";
  }

  const targetsLoopInput =
    isLoopOverItemsNode(targetNode) &&
    (targetHandle === "in" || targetHandle == null || targetHandle === "");

  if (targetsLoopInput && props.sourceY > props.targetY + 8) {
    return "loop-back";
  }

  if (targetsLoopInput && props.sourceX > props.targetX + 40 && props.sourceY >= props.targetY - 16) {
    return "loop-back";
  }

  return "default";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface Pt {
  x: number;
  y: number;
}

/**
 * Build an orthogonal (or arbitrary) polyline with rounded corners.
 * The corner radius is clamped to half of each adjacent segment so arcs never
 * overshoot — this prevents the "broken/kinked" corner artifact.
 */
function roundedPolylinePath(points: Pt[], radius: number): string {
  if (points.length < 2) return "";
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  const cmds: string[] = [`M ${points[0].x} ${points[0].y}`];

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    const inDx = curr.x - prev.x;
    const inDy = curr.y - prev.y;
    const outDx = next.x - curr.x;
    const outDy = next.y - curr.y;

    const inLen = Math.hypot(inDx, inDy) || 1;
    const outLen = Math.hypot(outDx, outDy) || 1;

    const r = Math.max(0, Math.min(radius, inLen / 2, outLen / 2));

    const entry = { x: curr.x - (inDx / inLen) * r, y: curr.y - (inDy / inLen) * r };
    const exit = { x: curr.x + (outDx / outLen) * r, y: curr.y + (outDy / outLen) * r };

    cmds.push(`L ${entry.x} ${entry.y}`);
    cmds.push(`Q ${curr.x} ${curr.y} ${exit.x} ${exit.y}`);
  }

  const last = points[points.length - 1];
  cmds.push(`L ${last.x} ${last.y}`);
  return cmds.join(" ");
}

/** Default edge: bezier, with an optional draggable midpoint waypoint. */
function buildDefaultPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  sourcePosition: Position,
  targetPosition: Position,
  adjustments: WorkflowEdgeRouteAdjustments,
): { path: string; labelX: number; labelY: number; dragHandles: WorkflowEdgeDragHandle[] } {
  const baseMidX = (sourceX + targetX) / 2;
  const baseMidY = (sourceY + targetY) / 2;
  const offsetX = adjustments.offsetX ?? 0;
  const offsetY = adjustments.offsetY ?? 0;

  if (offsetX !== 0 || offsetY !== 0) {
    const wpX = baseMidX + offsetX;
    const wpY = baseMidY + offsetY;
    // Quadratic control so the curve passes exactly through the waypoint at t=0.5.
    const ctrlX = 2 * wpX - 0.5 * sourceX - 0.5 * targetX;
    const ctrlY = 2 * wpY - 0.5 * sourceY - 0.5 * targetY;
    const path = `M ${sourceX} ${sourceY} Q ${ctrlX} ${ctrlY} ${targetX} ${targetY}`;
    return {
      path,
      labelX: wpX,
      labelY: wpY,
      dragHandles: [{ id: "midpoint", x: wpX, y: wpY, axis: "free" }],
    };
  }

  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  return {
    path,
    labelX,
    labelY,
    dragHandles: [{ id: "midpoint", x: baseMidX, y: baseMidY, axis: "free" }],
  };
}

/** Loop branch exit: down from `loop` port, then into target (n8n-style). */
function buildLoopOutPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  adjustments: WorkflowEdgeRouteAdjustments,
): { path: string; labelX: number; labelY: number; dragHandles: WorkflowEdgeDragHandle[] } {
  if (targetY > sourceY + 12) {
    const path = roundedPolylinePath(
      [
        { x: sourceX, y: sourceY },
        { x: sourceX, y: targetY },
        { x: targetX, y: targetY },
      ],
      LOOP_CORNER,
    );
    return {
      path,
      labelX: (sourceX + targetX) / 2,
      labelY: targetY - LOOP_CORNER,
      dragHandles: [],
    };
  }

  const offset = clamp(
    LOOP_OUT_OFFSET + (adjustments.loopOutOffset ?? 0),
    MIN_LOOP_OUT_OFFSET,
    MAX_LOOP_OUT_OFFSET,
  );
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    borderRadius: LOOP_CORNER,
    offset,
    stepPosition: 0,
  });

  return {
    path,
    labelX,
    labelY,
    dragHandles: [
      {
        id: "loopOutOffset",
        x: sourceX + offset,
        y: (sourceY + targetY) / 2,
        axis: "x",
      },
    ],
  };
}

/** Rounded orthogonal path along the bottom — n8n-style loop return. */
function buildLoopBackPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  adjustments: WorkflowEdgeRouteAdjustments,
): { path: string; labelX: number; labelY: number; dragHandles: WorkflowEdgeDragHandle[] } {
  const pad = clamp(
    LOOP_PADDING + (adjustments.loopPadding ?? 0),
    MIN_LOOP_PADDING,
    MAX_LOOP_PADDING,
  );
  const bottomY = Math.max(sourceY, targetY) + pad;
  // Keep the two vertical legs apart enough that corners never collapse.
  const legGap = Math.max(LOOP_CORNER * 2, pad * 0.55);
  const xOut = sourceX + legGap;
  const xIn = targetX - legGap;

  const path = roundedPolylinePath(
    [
      { x: sourceX, y: sourceY },
      { x: xOut, y: sourceY },
      { x: xOut, y: bottomY },
      { x: xIn, y: bottomY },
      { x: xIn, y: targetY },
      { x: targetX, y: targetY },
    ],
    LOOP_CORNER,
  );

  return {
    path,
    labelX: (xOut + xIn) / 2,
    labelY: bottomY,
    dragHandles: [
      {
        id: "loopPadding",
        x: (xOut + xIn) / 2,
        y: bottomY,
        axis: "y",
      },
    ],
  };
}

export function resolveWorkflowEdgePath(
  props: EdgeProps,
  nodes: Node[],
  routeAdjustments?: WorkflowEdgeRouteAdjustments,
): {
  path: string;
  labelX: number;
  labelY: number;
  route: WorkflowEdgeRoute;
  dragHandles: WorkflowEdgeDragHandle[];
} {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data } = props;
  const adjustments = routeAdjustments ?? readEdgeRouteAdjustments(data);
  const route = classifyWorkflowEdgeRoute(props, nodes);

  if (route === "loop-out") {
    const { path, labelX, labelY, dragHandles } = buildLoopOutPath(
      sourceX,
      sourceY,
      targetX,
      targetY,
      adjustments,
    );
    return { path, labelX, labelY, route, dragHandles };
  }

  if (route === "loop-back") {
    const { path, labelX, labelY, dragHandles } = buildLoopBackPath(
      sourceX,
      sourceY,
      targetX,
      targetY,
      adjustments,
    );
    return { path, labelX, labelY, route, dragHandles };
  }

  const { path, labelX, labelY, dragHandles } = buildDefaultPath(
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    adjustments,
  );
  return { path, labelX, labelY, route, dragHandles };
}

/** Convert a dragged handle position into persisted route adjustment values. */
export function routeAdjustmentFromDrag(
  handle: WorkflowEdgeDragHandle,
  flowX: number,
  flowY: number,
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
): WorkflowEdgeRouteAdjustments {
  if (handle.id === "loopPadding") {
    const baseBottom = Math.max(sourceY, targetY) + LOOP_PADDING;
    return {
      loopPadding: clamp(flowY - baseBottom, MIN_LOOP_PADDING - LOOP_PADDING, MAX_LOOP_PADDING - LOOP_PADDING),
    };
  }
  if (handle.id === "loopOutOffset") {
    return {
      loopOutOffset: clamp(
        flowX - sourceX - LOOP_OUT_OFFSET,
        MIN_LOOP_OUT_OFFSET - LOOP_OUT_OFFSET,
        MAX_LOOP_OUT_OFFSET - LOOP_OUT_OFFSET,
      ),
    };
  }
  if (handle.id === "midpoint") {
    const baseMidX = (sourceX + targetX) / 2;
    const baseMidY = (sourceY + targetY) / 2;
    return { offsetX: flowX - baseMidX, offsetY: flowY - baseMidY };
  }
  return {};
}
