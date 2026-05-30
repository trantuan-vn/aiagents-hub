"use client";

import type { ReactNode } from "react";

import { WorkflowEditorActionsProvider } from "./workflow-editor-actions-context";
import { WorkflowEditorAiSidebar } from "./workflow-editor-ai-sidebar";

interface WorkflowEditorShellWorkspaceProps {
  workflowId: number;
  workflowName: string;
  ownerId?: string;
  serviceEndpoint: string;
  readOnly: boolean;
  aiOpen: boolean;
  onAiOpenChange: (open: boolean) => void;
  onOpenSettings?: () => void;
  onAddNode: (type: string, label: string) => void;
  onAddStickyNote: () => void;
  onApplyDefinition?: (definitionJson: string) => void;
  children: ReactNode;
}

export function WorkflowEditorShellWorkspace({
  workflowId,
  workflowName,
  ownerId,
  serviceEndpoint,
  readOnly,
  aiOpen,
  onAiOpenChange,
  onOpenSettings,
  onAddNode,
  onAddStickyNote,
  onApplyDefinition,
  children,
}: WorkflowEditorShellWorkspaceProps) {
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="relative min-h-0 min-w-0 flex-1">
        <WorkflowEditorActionsProvider
          value={{
            onAddNode,
            onAddStickyNote,
            aiOpen,
            onToggleAi: () => onAiOpenChange(!aiOpen),
            serviceEndpoint,
            readOnly,
          }}
        >
          {children}
        </WorkflowEditorActionsProvider>
      </div>
      {!readOnly ? (
        <WorkflowEditorAiSidebar
          workflowId={workflowId}
          workflowName={workflowName}
          ownerId={ownerId}
          open={aiOpen}
          onOpenChange={onAiOpenChange}
          onOpenSettings={onOpenSettings}
          onApplyDefinition={onApplyDefinition}
        />
      ) : null}
    </div>
  );
}
