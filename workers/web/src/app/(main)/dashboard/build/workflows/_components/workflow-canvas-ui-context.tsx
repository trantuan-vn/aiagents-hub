"use client";

import { createContext, useContext } from "react";

import type { WorkflowHandleId } from "./workflow-connection-utils";
import type { WorkflowAddNodeDrawerOpenOptions } from "./workflow-add-node-drawer-store";

export type ConnectedNodeSide = "left" | "right" | "bottom";

export interface WorkflowCanvasUiValue {
  readOnly: boolean;
  createConnectedNode?: (args: {
    fromNodeId: string;
    side: ConnectedNodeSide | "resource";
    type: string;
    label: string;
    resourceHandle?: WorkflowHandleId;
    extraData?: Record<string, unknown>;
  }) => void;
  deleteEdge?: (edgeId: string) => void;
  deleteNode?: (nodeId: string) => void;
  patchNodeData?: (nodeId: string, patch: Record<string, unknown>) => void;
  toggleNodeActive?: (nodeId: string) => void;
  runNode?: (nodeId: string) => void;
  onNodeMenuAction?: (nodeId: string, action: string) => void;
  tidyLayout?: () => void;
  openAddNodeDrawer?: (options: WorkflowAddNodeDrawerOpenOptions) => void;
  closeAddNodeDrawer?: () => void;
}

export const WorkflowCanvasUiContext = createContext<WorkflowCanvasUiValue | null>(null);

export function useWorkflowCanvasUi(): WorkflowCanvasUiValue | null {
  return useContext(WorkflowCanvasUiContext);
}
