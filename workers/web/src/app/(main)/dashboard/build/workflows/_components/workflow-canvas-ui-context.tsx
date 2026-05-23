"use client";

import { createContext, useContext } from "react";

export type ConnectedNodeSide = "left" | "right";

export interface WorkflowCanvasUiValue {
  readOnly: boolean;
  createConnectedNode?: (args: {
    fromNodeId: string;
    side: ConnectedNodeSide;
    type: string;
    label: string;
  }) => void;
  deleteEdge?: (edgeId: string) => void;
  deleteNode?: (nodeId: string) => void;
  toggleNodeActive?: (nodeId: string) => void;
  runNode?: (nodeId: string) => void;
  onNodeMenuAction?: (nodeId: string, action: string) => void;
  tidyLayout?: () => void;
}

export const WorkflowCanvasUiContext = createContext<WorkflowCanvasUiValue | null>(null);

export function useWorkflowCanvasUi(): WorkflowCanvasUiValue | null {
  return useContext(WorkflowCanvasUiContext);
}
