"use client";

import type { ReactNode, RefObject } from "react";

import { useTranslations } from "next-intl";

import { WorkflowEditorHeaderEditActions, WorkflowEditorHeaderViewActions } from "./workflow-editor-header-actions";
import { WorkflowEditorHeaderLeft } from "./workflow-editor-header-left";
import { WorkflowEditorHeaderTabs } from "./workflow-editor-header-tabs";

export type WorkflowEditorTab = "editor" | "executions" | "triggers" | "evaluations";

interface WorkflowEditorHeaderProps {
  workflowName: string;
  onWorkflowNameChange?: (name: string) => void;
  tags?: string[];
  onTagsChange?: (tags: string[]) => void;
  nameInputRef?: RefObject<HTMLInputElement>;
  status?: "draft" | "published";
  activeTab: WorkflowEditorTab;
  onTabChange: (tab: WorkflowEditorTab) => void;
  readOnly?: boolean;
  backHref?: string;
  backLabel?: string;
  chatHref?: string;
  headerMeta?: ReactNode;
  saving?: boolean;
  publishing?: boolean;
  onPublish?: () => void;
  onOpenHistory?: () => void;
  onEditName?: () => void;
  onEditNote?: () => void;
  onDuplicate?: () => void;
  onDownload?: () => void;
  onShare?: () => void;
  onFavorite?: () => void;
  onImportFile?: (file: File) => void;
  onOpenSettings?: () => void;
  onDelete?: () => void;
}

export function WorkflowEditorHeader({
  workflowName,
  onWorkflowNameChange,
  tags,
  onTagsChange,
  nameInputRef,
  status = "published",
  activeTab,
  onTabChange,
  readOnly = false,
  backHref = "/dashboard/build/workflows",
  backLabel,
  chatHref,
  headerMeta,
  saving = false,
  publishing = false,
  onPublish,
  onOpenHistory,
  onEditName,
  onEditNote,
  onDuplicate,
  onDownload,
  onShare,
  onFavorite,
  onImportFile,
  onOpenSettings,
  onDelete,
}: WorkflowEditorHeaderProps) {
  const te = useTranslations("WorkflowEditorPage");
  const tv = useTranslations("WorkflowViewPage");
  const breadcrumb = backLabel ?? (readOnly ? tv("back") : te("breadcrumb_workflows"));

  const noop = () => undefined;
  const noopFile = () => undefined;

  return (
    <header className="border-border bg-background flex h-12 shrink-0 items-center gap-2 border-b px-3">
      <WorkflowEditorHeaderLeft
        workflowName={workflowName}
        onWorkflowNameChange={onWorkflowNameChange}
        tags={tags}
        onTagsChange={onTagsChange}
        readOnly={readOnly}
        backHref={backHref}
        backLabel={breadcrumb}
        headerMeta={headerMeta}
        nameInputRef={nameInputRef}
      />
      <WorkflowEditorHeaderTabs activeTab={activeTab} readOnly={readOnly} onTabChange={onTabChange} />
      {readOnly ? (
        <WorkflowEditorHeaderViewActions chatHref={chatHref} />
      ) : (
        <WorkflowEditorHeaderEditActions
          status={status}
          saving={saving}
          publishing={publishing}
          onPublish={onPublish ?? noop}
          onOpenHistory={onOpenHistory ?? noop}
          onEditName={onEditName ?? noop}
          onEditNote={onEditNote ?? noop}
          onDuplicate={onDuplicate ?? noop}
          onDownload={onDownload ?? noop}
          onShare={onShare ?? noop}
          onFavorite={onFavorite ?? noop}
          onImportFile={onImportFile ?? noopFile}
          onOpenSettings={onOpenSettings ?? noop}
          onDelete={onDelete ?? noop}
        />
      )}
    </header>
  );
}
