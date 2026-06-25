import type { Node } from "@xyflow/react";

export const WORKFLOW_GROUP_NODE_TYPE = "workflow_group";

export const GROUP_PADDING = 20;
export const GROUP_HEADER_HEIGHT = 28;

const DEFAULT_NODE_WIDTH = 220;
const DEFAULT_NODE_HEIGHT = 72;
const STICKY_NOTE_WIDTH = 200;
const STICKY_NOTE_HEIGHT = 120;

export function isWorkflowGroupNode(node: Pick<Node, "type">): boolean {
  return node.type === WORKFLOW_GROUP_NODE_TYPE;
}

export function isGroupableNode(node: Node): boolean {
  return !isWorkflowGroupNode(node);
}

function parseDimension(value: number | string | undefined, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function getNodeSize(node: Node): { width: number; height: number } {
  const style = node.style as { width?: number | string; height?: number | string } | undefined;
  const defaults =
    node.type === "sticky_note"
      ? { width: STICKY_NOTE_WIDTH, height: STICKY_NOTE_HEIGHT }
      : { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT };

  return {
    width: parseDimension(node.measured?.width ?? node.width ?? style?.width, defaults.width),
    height: parseDimension(node.measured?.height ?? node.height ?? style?.height, defaults.height),
  };
}

export function getAbsolutePosition(node: Node, nodeMap: Map<string, Node>): { x: number; y: number } {
  let x = node.position.x;
  let y = node.position.y;
  let current: Node | undefined = node;
  const visited = new Set<string>();

  while (current?.parentId) {
    if (visited.has(current.parentId)) break;
    visited.add(current.parentId);
    const parent = nodeMap.get(current.parentId);
    if (!parent) break;
    x += parent.position.x;
    y += parent.position.y;
    current = parent;
  }

  return { x, y };
}

function expandSelectionWithGroupChildren(nodes: Node[], selectedIds: Set<string>): Node[] {
  const expanded = new Set(selectedIds);
  for (const id of selectedIds) {
    const node = nodes.find((candidate) => candidate.id === id);
    if (!node || !isWorkflowGroupNode(node)) continue;
    for (const child of nodes) {
      if (child.parentId === id) expanded.add(child.id);
    }
  }
  return nodes.filter((node) => expanded.has(node.id));
}

export function getSelectedGroupableNodes(nodes: Node[]): Node[] {
  const selectedIds = new Set(nodes.filter((node) => node.selected).map((node) => node.id));
  if (selectedIds.size === 0) return [];
  return expandSelectionWithGroupChildren(nodes, selectedIds).filter(isGroupableNode);
}

export function canGroupNodes(nodes: Node[]): boolean {
  const groupable = getSelectedGroupableNodes(nodes);
  if (groupable.length < 2) return false;

  const parentIds = new Set(groupable.map((node) => node.parentId).filter(Boolean));
  if (parentIds.size === 1) {
    const parentId = [...parentIds][0];
    const selectedGroup = nodes.find((node) => node.selected && isWorkflowGroupNode(node));
    if (!selectedGroup && groupable.every((node) => node.parentId === parentId)) {
      return false;
    }
  }

  return true;
}

export function canUngroupNodes(nodes: Node[]): boolean {
  const selected = nodes.filter((node) => node.selected);
  return selected.some((node) => isWorkflowGroupNode(node) || Boolean(node.parentId));
}

export function groupNodes(nodes: Node[]): Node[] {
  const groupable = getSelectedGroupableNodes(nodes);
  if (groupable.length < 2) return nodes;

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const groupableIds = new Set(groupable.map((node) => node.id));
  const groupId = `${WORKFLOW_GROUP_NODE_TYPE}-${Date.now()}`;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const node of groupable) {
    const absolute = getAbsolutePosition(node, nodeMap);
    const size = getNodeSize(node);
    minX = Math.min(minX, absolute.x);
    minY = Math.min(minY, absolute.y);
    maxX = Math.max(maxX, absolute.x + size.width);
    maxY = Math.max(maxY, absolute.y + size.height);
  }

  const groupPosition = {
    x: minX - GROUP_PADDING,
    y: minY - GROUP_PADDING - GROUP_HEADER_HEIGHT,
  };
  const groupWidth = maxX - minX + GROUP_PADDING * 2;
  const groupHeight = maxY - minY + GROUP_PADDING * 2 + GROUP_HEADER_HEIGHT;

  const groupNode: Node = {
    id: groupId,
    type: WORKFLOW_GROUP_NODE_TYPE,
    position: groupPosition,
    style: { width: groupWidth, height: groupHeight },
    data: { label: "Group" },
    zIndex: -1,
    selectable: true,
    draggable: true,
    selected: true,
  };

  const oldParentIds = new Set(
    groupable.map((node) => node.parentId).filter((parentId): parentId is string => Boolean(parentId)),
  );

  const nextNodes = nodes
    .filter((node) => {
      if (!oldParentIds.has(node.id) || !isWorkflowGroupNode(node)) return true;
      const remainingChildren = nodes.filter(
        (child) => child.parentId === node.id && !groupableIds.has(child.id),
      );
      return remainingChildren.length > 0;
    })
    .map((node) => {
      if (!groupableIds.has(node.id)) {
        return node.selected ? { ...node, selected: false } : node;
      }

      const absolute = getAbsolutePosition(node, nodeMap);
      return {
        ...node,
        parentId: groupId,
        extent: "parent" as const,
        position: {
          x: absolute.x - groupPosition.x,
          y: absolute.y - groupPosition.y,
        },
        selected: false,
      };
    });

  // React Flow requires a parent node to appear before its children in the array.
  return [groupNode, ...nextNodes];
}

export function ungroupNodes(nodes: Node[]): Node[] {
  const selected = nodes.filter((node) => node.selected);
  const groupIdsToDissolve = new Set<string>();

  for (const node of selected) {
    if (isWorkflowGroupNode(node)) {
      groupIdsToDissolve.add(node.id);
      continue;
    }
    if (node.parentId) groupIdsToDissolve.add(node.parentId);
  }

  if (groupIdsToDissolve.size === 0) return nodes;

  let nextNodes = nodes.map((node) => {
    if (!node.parentId || !groupIdsToDissolve.has(node.parentId)) return node;

    const nodeMap = new Map(nodes.map((candidate) => [candidate.id, candidate]));
    const absolute = getAbsolutePosition(node, nodeMap);
    const { parentId: _parentId, extent: _extent, ...rest } = node;

    return {
      ...rest,
      position: absolute,
      selected: true,
    };
  });

  nextNodes = nextNodes.filter((node) => !(isWorkflowGroupNode(node) && groupIdsToDissolve.has(node.id)));
  return nextNodes;
}

export function selectAllNodes(nodes: Node[]): Node[] {
  return nodes.map((node) => ({ ...node, selected: true }));
}

export function clearNodeSelection(nodes: Node[]): Node[] {
  return nodes.map((node) => (node.selected ? { ...node, selected: false } : node));
}