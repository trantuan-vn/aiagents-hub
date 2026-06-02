"use client";

import { useRef, useState, type RefObject } from "react";

import { cn } from "@/lib/utils";

import { WorkflowEditorHeader, type WorkflowEditorTab } from "./workflow-editor-header";
import { WorkflowEditorLogsPanel } from "./workflow-editor-logs-panel";
import { WorkflowEditorSettingsSheet } from "./workflow-editor-settings-sheet";
import { resolveWorkflowEditorShellProps, type WorkflowEditorShellProps } from "./workflow-editor-shell-props";
import { WorkflowEditorShellWorkspace } from "./workflow-editor-shell-workspace";
import { WorkflowExecutionsPanel } from "./workflow-executions-panel";
import { WorkflowHistorySheet } from "./workflow-history-sheet";
import { WorkflowTriggersPanel } from "./workflow-triggers-panel";

export function WorkflowEditorShell(props: WorkflowEditorShellProps) {
  const {
    workflowId,
    workflowName,
    onWorkflowNameChange,
    workflowTags,
    onWorkflowTagsChange,
    nameInputRef,
    descriptionInputRef,
    children,
    readOnly = false,
    ownerId,
    chatHref,
    headerMeta,
    backHref,
    backLabel,
    onApplyDefinition,
    saving = false,
    publishing = false,
    onPublish,
    onDuplicate,
    onDownload,
    onShare,
    onFavorite,
    onImportDefinition,
    onDelete,
    onEditName,
    onEditNote,
  } = props;

  const [activeTab, setActiveTab] = useState<WorkflowEditorTab>("editor");
  const [aiOpen, setAiOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const localNameRef = useRef<HTMLInputElement>(null) as RefObject<HTMLInputElement>;
  const localDescRef = useRef<HTMLTextAreaElement>(null) as RefObject<HTMLTextAreaElement>;
  const resolvedNameRef = nameInputRef ?? localNameRef;
  const resolvedDescRef = descriptionInputRef ?? localDescRef;

  const { editSettings, onAddNode, onAddStickyNote, status: resolvedStatus } = resolveWorkflowEditorShellProps(
    props,
    readOnly,
  );
  const displayStatus =
    !readOnly && "status" in props ? (props as { status: "draft" | "published" }).status : resolvedStatus;

  const openSettings = readOnly ? undefined : () => setSettingsOpen(true);
  const focusName = () => {
    onEditName?.();
    resolvedNameRef.current?.focus();
    resolvedNameRef.current?.select();
  };
  const focusNote = () => {
    onEditNote?.();
    setSettingsOpen(true);
    window.setTimeout(() => resolvedDescRef.current?.focus(), 150);
  };

  const handleImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "");
        const parsed = JSON.parse(text) as { nodes?: unknown; edges?: unknown };
        if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
          throw new Error("Invalid workflow JSON");
        }
        onImportDefinition?.(JSON.stringify(parsed));
      } catch {
        /* caller may toast */
      }
    };
    reader.readAsText(file);
  };

  return (
    <div
      className={cn(
        "workflow-editor-shell -mx-4 -mt-4 -mb-4 flex flex-col md:-mx-6 md:-mt-6 md:-mb-6",
        "h-[calc(100dvh-3rem)] max-h-[calc(100dvh-3rem)]",
      )}
    >
      <WorkflowEditorHeader
        workflowName={workflowName}
        onWorkflowNameChange={onWorkflowNameChange}
        tags={workflowTags}
        onTagsChange={onWorkflowTagsChange}
        nameInputRef={resolvedNameRef}
        status={displayStatus}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        saving={saving}
        publishing={publishing}
        onPublish={onPublish}
        onOpenHistory={() => setHistoryOpen(true)}
        onEditName={focusName}
        onEditNote={focusNote}
        onDuplicate={onDuplicate}
        onDownload={onDownload}
        onShare={onShare}
        onFavorite={onFavorite}
        onImportFile={handleImportFile}
        onOpenSettings={openSettings}
        onDelete={onDelete}
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
      ) : (
        <WorkflowEditorShellWorkspace
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
        <WorkflowEditorSettingsSheet
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          descriptionInputRef={resolvedDescRef}
          {...editSettings}
        />
      ) : null}

      {!readOnly ? (
        <WorkflowHistorySheet
          workflowId={workflowId}
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          onApplyDefinition={onApplyDefinition}
        />
      ) : null}
    </div>
  );
}
