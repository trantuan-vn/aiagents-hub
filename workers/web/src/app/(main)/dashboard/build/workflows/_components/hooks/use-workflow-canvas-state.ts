"use client";

import { useCallback, useEffect, useRef } from "react";

import {
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
} from "@xyflow/react";

import { isResourceEdge, isValidWorkflowConnection } from "../edges/workflow-connection-utils";
import { applyCreateConnectedNode, type CreateConnectedNodeArgs } from "../layout/workflow-create-connected-node";
import { persistedSignature, toPersistedDefinition, type WorkflowDefinition } from "../layout/workflow-definition";
import { normalizeWorkflowEdge } from "../edges/workflow-edge-utils";
import { readEdgeRouteAdjustments, type WorkflowEdgeRouteAdjustments } from "../edges/workflow-edge-route-data";
import { layoutWorkflowNodes } from "../layout/workflow-layout";
import {
  clearNodeSelection,
  groupNodes,
  isWorkflowGroupNode,
  selectAllNodes,
  ungroupNodes,
} from "../layout/workflow-node-group-utils";

function shouldPersistNodeChanges(changes: NodeChange[]): boolean {
  return changes.some((c) => {
    if (c.type === "select") return false;
    if (c.type === "position") return "dragging" in c && c.dragging === false;
    return c.type === "add" || c.type === "remove" || c.type === "replace" || c.type === "dimensions";
  });
}

export function useWorkflowCanvasState(
  initial: WorkflowDefinition | undefined,
  onChange?: (def: WorkflowDefinition) => void,
  readOnly?: boolean,
  serviceEndpoint?: string,
  externalSyncKey?: number,
  workflowId?: number,
) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initial?.nodes ?? []);
  const [edges, setEdges, onEdgesChange] = useEdgesState((initial?.edges ?? []).map(normalizeWorkflowEdge));

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const lastEmittedRef = useRef("");
  const viewportRef = useRef(initial?.viewport);
  viewportRef.current = initial?.viewport;

  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const deletedEdgeIdsRef = useRef(new Set<string>());
  const externalSyncKeyRef = useRef(externalSyncKey ?? 0);

  const pushToParent = useCallback(() => {
    if (readOnly) return;
    const n = nodesRef.current;
    const e = edgesRef.current;
    const sig = persistedSignature(n, e);
    if (sig === lastEmittedRef.current) return;
    lastEmittedRef.current = sig;
    onChangeRef.current?.(toPersistedDefinition(n, e, viewportRef.current));
  }, [readOnly]);

  // Parent-driven replace (undo/redo, import, version restore, collab).
  useEffect(() => {
    if (externalSyncKey === undefined) return;
    if (externalSyncKey === externalSyncKeyRef.current) return;
    externalSyncKeyRef.current = externalSyncKey;

    const extNodes = initial?.nodes ?? [];
    const extEdges = (initial?.edges ?? []).map(normalizeWorkflowEdge);
    nodesRef.current = extNodes;
    edgesRef.current = extEdges;
    deletedEdgeIdsRef.current.clear();
    lastEmittedRef.current = persistedSignature(extNodes, extEdges);
    setNodes(extNodes);
    setEdges(extEdges);
  }, [externalSyncKey, initial, setNodes, setEdges]);

  // Merge nodes/edges added via palette (parent JSON) without resetting positions while dragging.
  useEffect(() => {
    const extNodes = initial?.nodes ?? [];
    const localNodeIdSet = new Set(nodes.map((n) => n.id));
    const missingNodes = extNodes.filter((n) => !localNodeIdSet.has(n.id));
    if (missingNodes.length > 0) {
      setNodes((nds) => {
        const merged = [...nds, ...missingNodes];
        lastEmittedRef.current = persistedSignature(merged, edgesRef.current);
        return merged;
      });
    }

    const extEdges = initial?.edges ?? [];
    for (const id of deletedEdgeIdsRef.current) {
      if (!extEdges.some((e) => e.id === id)) {
        deletedEdgeIdsRef.current.delete(id);
      }
    }
    const localEdgeIdSet = new Set(edges.map((e) => e.id));
    const missingEdges = extEdges.filter((e) => !localEdgeIdSet.has(e.id) && !deletedEdgeIdsRef.current.has(e.id));
    if (missingEdges.length > 0) {
      setEdges((eds) => {
        const merged = [...eds, ...missingEdges.map(normalizeWorkflowEdge)];
        lastEmittedRef.current = persistedSignature(nodesRef.current, merged);
        return merged;
      });
    }
  }, [initial?.nodes, initial?.edges, nodes, edges, setNodes, setEdges]);

  const onNodeDragStop = useCallback(() => {
    pushToParent();
  }, [pushToParent]);

  const onNodesDelete = useCallback(
    (deleted: Node[]) => {
      const deletedIds = new Set(deleted.map((n) => n.id));
      const deletedGroups = new Map(
        deleted.filter((node) => isWorkflowGroupNode(node)).map((node) => [node.id, node]),
      );

      setNodes((nds) => {
        const nextNodes = nds.map((node) => {
          if (!node.parentId || !deletedIds.has(node.parentId)) return node;
          const parent = deletedGroups.get(node.parentId);
          if (!parent) return node;

          const { parentId: _parentId, extent: _extent, ...rest } = node;
          return {
            ...rest,
            position: {
              x: node.position.x + parent.position.x,
              y: node.position.y + parent.position.y,
            },
          };
        });
        nodesRef.current = nextNodes;
        lastEmittedRef.current = persistedSignature(nextNodes, edgesRef.current);
        onChangeRef.current?.(toPersistedDefinition(nextNodes, edgesRef.current, viewportRef.current));
        return nextNodes;
      });

      const nextEdges = edgesRef.current.filter((e) => !deletedIds.has(e.source) && !deletedIds.has(e.target));
      edgesRef.current = nextEdges;
      setEdges(nextEdges);
    },
    [setNodes, setEdges],
  );

  const onEdgesDelete = useCallback((deleted: Edge[]) => {
    const deletedIds = new Set(deleted.map((e) => e.id));
    const nextEdges = edgesRef.current.filter((e) => !deletedIds.has(e.id));
    edgesRef.current = nextEdges;
    lastEmittedRef.current = persistedSignature(nodesRef.current, nextEdges);
    onChangeRef.current?.(toPersistedDefinition(nodesRef.current, nextEdges, viewportRef.current));
  }, []);

  const deleteEdgeById = useCallback(
    (edgeId: string) => {
      if (readOnly) return;
      deletedEdgeIdsRef.current.add(edgeId);
      const nextEdges = edgesRef.current.filter((e) => e.id !== edgeId);
      edgesRef.current = nextEdges;
      setEdges(nextEdges);
      lastEmittedRef.current = persistedSignature(nodesRef.current, nextEdges);
      onChangeRef.current?.(toPersistedDefinition(nodesRef.current, nextEdges, viewportRef.current));
    },
    [readOnly, setEdges],
  );

  const patchEdgeRouteById = useCallback(
    (edgeId: string, patch: WorkflowEdgeRouteAdjustments) => {
      if (readOnly) return;
      setEdges((eds) => {
        const nextEdges = eds.map((e) => {
          if (e.id !== edgeId) return e;
          const current = readEdgeRouteAdjustments(e.data);
          const routeAdjustments = { ...current, ...patch };
          return {
            ...e,
            data: {
              ...((e.data as Record<string, unknown> | undefined) ?? {}),
              routeAdjustments,
            },
          };
        });
        edgesRef.current = nextEdges;
        lastEmittedRef.current = persistedSignature(nodesRef.current, nextEdges);
        onChangeRef.current?.(toPersistedDefinition(nodesRef.current, nextEdges, viewportRef.current));
        return nextEdges;
      });
    },
    [readOnly, setEdges],
  );

  const deleteNodeById = useCallback(
    (nodeId: string) => {
      if (readOnly) return;
      const target = nodesRef.current.find((node) => node.id === nodeId);
      if (!target) return;

      if (isWorkflowGroupNode(target)) {
        setNodes((nds) => {
          const nextNodes = nds
            .filter((node) => node.id !== nodeId)
            .map((node) => {
              if (node.parentId !== nodeId) return node;
              const { parentId: _parentId, extent: _extent, ...rest } = node;
              return {
                ...rest,
                position: {
                  x: node.position.x + target.position.x,
                  y: node.position.y + target.position.y,
                },
              };
            });
          nodesRef.current = nextNodes;
          lastEmittedRef.current = persistedSignature(nextNodes, edgesRef.current);
          onChangeRef.current?.(toPersistedDefinition(nextNodes, edgesRef.current, viewportRef.current));
          return nextNodes;
        });
        return;
      }

      const nextNodes = nodesRef.current.filter((n) => n.id !== nodeId);
      const nextEdges = edgesRef.current.filter((e) => e.source !== nodeId && e.target !== nodeId);
      nodesRef.current = nextNodes;
      edgesRef.current = nextEdges;
      setNodes(nextNodes);
      setEdges(nextEdges);
      lastEmittedRef.current = persistedSignature(nextNodes, nextEdges);
      onChangeRef.current?.(toPersistedDefinition(nextNodes, nextEdges, viewportRef.current));
    },
    [readOnly, setNodes, setEdges],
  );

  const toggleNodeActive = useCallback(
    (nodeId: string) => {
      if (readOnly) return;
      setNodes((nds) => {
        const nextNodes = nds.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, deactivated: !(n.data as { deactivated?: boolean }).deactivated } }
            : n,
        );
        nodesRef.current = nextNodes;
        lastEmittedRef.current = persistedSignature(nextNodes, edgesRef.current);
        onChangeRef.current?.(toPersistedDefinition(nextNodes, edgesRef.current, viewportRef.current));
        return nextNodes;
      });
    },
    [readOnly, setNodes],
  );

  const patchNodeDataById = useCallback(
    (nodeId: string, patch: Record<string, unknown>) => {
      if (readOnly) return;
      setNodes((nds) => {
        const nextNodes = nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...(n.data as Record<string, unknown>), ...patch } } : n,
        );
        nodesRef.current = nextNodes;
        lastEmittedRef.current = persistedSignature(nextNodes, edgesRef.current);
        onChangeRef.current?.(toPersistedDefinition(nextNodes, edgesRef.current, viewportRef.current));
        return nextNodes;
      });
    },
    [readOnly, setNodes],
  );

  const duplicateNodeById = useCallback(
    (nodeId: string) => {
      if (readOnly) return;
      const source = nodesRef.current.find((n) => n.id === nodeId);
      if (!source) return;
      const newId = `${source.type}-${Date.now()}`;
      const newNode: Node = {
        ...source,
        id: newId,
        position: { x: source.position.x + 40, y: source.position.y + 40 },
        selected: false,
        data: { ...source.data },
      };
      const nextNodes = [...nodesRef.current, newNode];
      nodesRef.current = nextNodes;
      setNodes(nextNodes);
      lastEmittedRef.current = persistedSignature(nextNodes, edgesRef.current);
      onChangeRef.current?.(toPersistedDefinition(nextNodes, edgesRef.current, viewportRef.current));
    },
    [readOnly, setNodes],
  );

  const tidyLayout = useCallback(() => {
    if (readOnly) return;
    setNodes((nds) => {
      const nextNodes = layoutWorkflowNodes(nds, edgesRef.current);
      nodesRef.current = nextNodes;
      lastEmittedRef.current = persistedSignature(nextNodes, edgesRef.current);
      onChangeRef.current?.(toPersistedDefinition(nextNodes, edgesRef.current, viewportRef.current));
      return nextNodes;
    });
  }, [readOnly, setNodes]);

  const applyNodeTransform = useCallback(
    (transform: (nodes: Node[]) => Node[], persist = true) => {
      if (readOnly) return;
      setNodes((nds) => {
        const nextNodes = transform(nds);
        nodesRef.current = nextNodes;
        if (persist) {
          lastEmittedRef.current = persistedSignature(nextNodes, edgesRef.current);
          onChangeRef.current?.(toPersistedDefinition(nextNodes, edgesRef.current, viewportRef.current));
        }
        return nextNodes;
      });
    },
    [readOnly, setNodes],
  );

  const groupSelectedNodes = useCallback(() => {
    applyNodeTransform(groupNodes);
  }, [applyNodeTransform]);

  const ungroupSelectedNodes = useCallback(() => {
    applyNodeTransform(ungroupNodes);
  }, [applyNodeTransform]);

  const selectAllNodesOnCanvas = useCallback(() => {
    applyNodeTransform(selectAllNodes, false);
  }, [applyNodeTransform]);

  const clearSelectionOnCanvas = useCallback(() => {
    applyNodeTransform(clearNodeSelection, false);
  }, [applyNodeTransform]);

  const onNodeMenuAction = useCallback(
    (nodeId: string, action: string) => {
      if (readOnly) return;
      switch (action) {
        case "deactivate":
          toggleNodeActive(nodeId);
          break;
        case "duplicate":
          duplicateNodeById(nodeId);
          break;
        case "delete":
          deleteNodeById(nodeId);
          break;
        case "select_all":
          selectAllNodesOnCanvas();
          break;
        case "clear_selection":
          clearSelectionOnCanvas();
          break;
        case "group":
          groupSelectedNodes();
          break;
        case "ungroup":
          ungroupSelectedNodes();
          break;
        default:
          break;
      }
    },
    [
      readOnly,
      toggleNodeActive,
      duplicateNodeById,
      deleteNodeById,
      selectAllNodesOnCanvas,
      clearSelectionOnCanvas,
      groupSelectedNodes,
      ungroupSelectedNodes,
    ],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => {
        const resource = isResourceEdge(params);
        const next = addEdge(
          normalizeWorkflowEdge({
            ...params,
            animated: true,
            style: resource ? { strokeDasharray: "6 4" } : undefined,
          }),
          eds,
        );
        edgesRef.current = next;
        lastEmittedRef.current = persistedSignature(nodesRef.current, next);
        onChangeRef.current?.(toPersistedDefinition(nodesRef.current, next, viewportRef.current));
        return next;
      });
    },
    [setEdges],
  );

  const onEdgesChangeWrapped = useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) => {
      onEdgesChange(changes);
      if (readOnly) return;
      queueMicrotask(() => {
        pushToParent();
      });
    },
    [onEdgesChange, pushToParent, readOnly],
  );

  const onNodesChangeWrapped = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes);
      if (readOnly) return;
      if (shouldPersistNodeChanges(changes)) {
        queueMicrotask(() => pushToParent());
      }
    },
    [onNodesChange, pushToParent, readOnly],
  );

  const createConnectedNode = useCallback(
    (args: CreateConnectedNodeArgs) => {
      if (readOnly) return;
      const result = applyCreateConnectedNode(nodesRef.current, edgesRef.current, args, serviceEndpoint, workflowId);
      if (!result) return;
      nodesRef.current = result.nodes;
      edgesRef.current = result.edges;
      setNodes(result.nodes);
      setEdges(result.edges);
      queueMicrotask(() => {
        lastEmittedRef.current = "";
        pushToParent();
      });
    },
    [readOnly, serviceEndpoint, workflowId, setNodes, setEdges, pushToParent],
  );

  const isValidConnection = useCallback(
    (connection: Connection | Edge) =>
      isValidWorkflowConnection(connection, edgesRef.current, nodesRef.current),
    [],
  );

  return {
    nodes,
    edges,
    onNodesChange: onNodesChangeWrapped,
    onEdgesChange: onEdgesChangeWrapped,
    onConnect,
    onNodeDragStop,
    onNodesDelete,
    onEdgesDelete,
    createConnectedNode,
    deleteEdgeById,
    patchEdgeRouteById,
    deleteNodeById,
    patchNodeDataById,
    toggleNodeActive,
    onNodeMenuAction,
    tidyLayout,
    isValidConnection,
    groupSelectedNodes,
    ungroupSelectedNodes,
    selectAllNodesOnCanvas,
    clearSelectionOnCanvas,
  };
}
