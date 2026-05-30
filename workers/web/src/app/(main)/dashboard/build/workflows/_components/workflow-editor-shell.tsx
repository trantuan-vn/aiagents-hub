"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

import { WorkflowEditorHeader, type WorkflowEditorTab } from "./workflow-editor-header";
import { WorkflowEditorLogsPanel } from "./workflow-editor-logs-panel";
import { WorkflowEditorSettingsSheet } from "./workflow-editor-settings-sheet";
import { resolveWorkflowEditorShellProps, type WorkflowEditorShellProps } from "./workflow-editor-shell-props";
import { WorkflowEditorShellWorkspace } from "./workflow-editor-shell-workspace";
import { WorkflowExecutionsPanel } from "./workflow-executions-panel";
import { WorkflowTriggersPanel } from "./workflow-triggers-panel";
import { WorkflowVersionsPanel } from "./workflow-versions-panel";

export function WorkflowEditorShell(props: WorkflowEditorShellProps) {
  const {
    workflowId,
    workflowName,
    serviceEndpoint = "",
    onExecute,
    children,
    readOnly = false,
    ownerId,
    chatHref,
    headerMeta,
    backHref,
    backLabel,
    onApplyDefinition,
  } = props;

  const [activeTab, setActiveTab] = useState<WorkflowEditorTab>("editor");
  const [aiOpen, setAiOpen] = useState(true);
  const [logsOpen, setLogsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { editSettings, saving, onSave, onAddNode, onAddStickyNote, status } = resolveWorkflowEditorShellProps(
    props,
    readOnly,
  );

  const openSettings = readOnly ? undefined : () => setSettingsOpen(true);

  return (
    <div
      className={cn(
        "workflow-editor-shell -mx-4 -mt-4 -mb-4 flex flex-col md:-mx-6 md:-mt-6 md:-mb-6",
        "h-[calc(100dvh-3rem)] max-h-[calc(100dvh-3rem)]",
      )}
    >
      <WorkflowEditorHeader
        workflowName={workflowName}
        status={status}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        saving={saving}
        onSave={onSave}
        onExecute={onExecute}
        onOpenSettings={openSettings}
        readOnly={readOnly}
        backHref={backHref}
        backLabel={backLabel}
        chatHref={chatHref}
        headerMeta={headerMeta}
      />

      {activeTab === "executions" ? (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <WorkflowExecutionsPanel workflowId={workflowId} onApplyDefinition={onApplyDefinition} />
        </div>
      ) : activeTab === "triggers" ? (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <WorkflowTriggersPanel workflowId={workflowId} />
        </div>
      ) : activeTab === "versions" ? (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <WorkflowVersionsPanel workflowId={workflowId} onApplyDefinition={onApplyDefinition} />
        </div>
      ) : (
        <WorkflowEditorShellWorkspace
          workflowId={workflowId}
          workflowName={workflowName}
          ownerId={ownerId}
          serviceEndpoint={serviceEndpoint}
          readOnly={readOnly}
          aiOpen={aiOpen}
          onAiOpenChange={setAiOpen}
          onOpenSettings={openSettings}
          onAddNode={onAddNode}
          onAddStickyNote={onAddStickyNote}
          onApplyDefinition={onApplyDefinition}
        >
          {children}
        </WorkflowEditorShellWorkspace>
      )}

      <WorkflowEditorLogsPanel open={logsOpen} onOpenChange={setLogsOpen} />

      {editSettings ? (
        <WorkflowEditorSettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} {...editSettings} />
      ) : null}
    </div>
  );
}
