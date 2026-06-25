"use client";

import { createContext, useContext } from "react";

import type { CreateConnectedNodeArgs } from "../layout/workflow-create-connected-node";
import type { WorkflowAddNodeDrawerOpenOptions } from "../add-node/workflow-add-node-drawer-store";
import type { WorkflowEdgeRouteAdjustments } from "../edges/workflow-edge-route-data";

export type ConnectedNodeSide = "left" | "right" | "bottom";

export interface WorkflowCanvasUiValue {
  readOnly: boolean;
  createConnectedNode?: (args: CreateConnectedNodeArgs) => void;
  deleteEdge?: (edgeId: string) => void;
  patchEdgeRoute?: (edgeId: string, patch: WorkflowEdgeRouteAdjustments) => void;
  deleteNode?: (nodeId: string) => void;
  patchNodeData?: (nodeId: string, patch: Record<string, unknown>) => void;
  toggleNodeActive?: (nodeId: string) => void;
  runNode?: (nodeId: string) => void;
  onNodeMenuAction?: (nodeId: string, action: string) => void;
  tidyLayout?: () => void;
  openAddNodeDrawer?: (options: WorkflowAddNodeDrawerOpenOptions) => void;
  closeAddNodeDrawer?: () => void;
  openNodeConfig?: (nodeId: string) => void;
  groupSelected?: () => void;
  ungroupSelected?: () => void;
  selectAll?: () => void;
  clearSelection?: () => void;
}

export const WorkflowCanvasUiContext = createContext<WorkflowCanvasUiValue | null>(null);

export function useWorkflowCanvasUi(): WorkflowCanvasUiValue | null {
  return useContext(WorkflowCanvasUiContext);
}
