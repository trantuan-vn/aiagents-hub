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
}

export const WorkflowCanvasUiContext = createContext<WorkflowCanvasUiValue | null>(null);

export function useWorkflowCanvasUi(): WorkflowCanvasUiValue | null {
  return useContext(WorkflowCanvasUiContext);
}
