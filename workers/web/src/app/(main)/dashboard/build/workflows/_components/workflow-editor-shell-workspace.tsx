"use client";

import { useEffect, useMemo, type ReactNode } from "react";

import { WorkflowAddNodeDrawer } from "./workflow-add-node-drawer";
import { WorkflowEditorActionsProvider } from "./workflow-editor-actions-context";
import { WorkflowEditorAiSidebar } from "./workflow-editor-ai-sidebar";
import { prefetchApprovedServices } from "./use-approved-services";

interface WorkflowEditorShellWorkspaceProps {
  workflowId: number;
  workflowName: string;
  ownerId?: string;
  serviceEndpoint: string;
  readOnly: boolean;
  aiOpen: boolean;
  onAiOpenChange: (open: boolean) => void;
  onOpenSettings?: () => void;
  onAddNode: (type: string, label: string, extra?: Record<string, unknown>) => void;
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
  const actionsValue = useMemo(
    () => ({
      onAddNode,
      onAddStickyNote,
      aiOpen,
      onToggleAi: () => onAiOpenChange(!aiOpen),
      serviceEndpoint,
      readOnly,
    }),
    [onAddNode, onAddStickyNote, aiOpen, onAiOpenChange, serviceEndpoint, readOnly],
  );

  useEffect(() => {
    if (!readOnly) void prefetchApprovedServices();
  }, [readOnly]);

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        <WorkflowEditorActionsProvider value={actionsValue}>{children}</WorkflowEditorActionsProvider>
        {!readOnly ? <WorkflowAddNodeDrawer /> : null}
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
