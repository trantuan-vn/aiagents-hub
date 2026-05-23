"use client";

import { createContext, useContext, type ReactNode } from "react";

export interface WorkflowEditorActionsValue {
  onAddNode: (type: string, label: string) => void;
  onAddStickyNote: () => void;
  aiOpen: boolean;
  onToggleAi: () => void;
  serviceEndpoint?: string;
  readOnly?: boolean;
}

const WorkflowEditorActionsContext = createContext<WorkflowEditorActionsValue | null>(null);

export function WorkflowEditorActionsProvider({
  value,
  children,
}: {
  value: WorkflowEditorActionsValue;
  children: ReactNode;
}) {
  return <WorkflowEditorActionsContext.Provider value={value}>{children}</WorkflowEditorActionsContext.Provider>;
}

export function useWorkflowEditorActions(): WorkflowEditorActionsValue | null {
  return useContext(WorkflowEditorActionsContext);
}
