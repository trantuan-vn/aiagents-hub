"use client";

import type { ReactNode } from "react";

import { useTranslations } from "next-intl";

import { WorkflowEditorHeaderEditActions, WorkflowEditorHeaderViewActions } from "./workflow-editor-header-actions";
import { WorkflowEditorHeaderLeft } from "./workflow-editor-header-left";
import { WorkflowEditorHeaderTabs } from "./workflow-editor-header-tabs";

export type WorkflowEditorTab = "editor" | "executions" | "evaluations";

interface WorkflowEditorHeaderProps {
  workflowName: string;
  status?: "draft" | "published";
  activeTab: WorkflowEditorTab;
  onTabChange: (tab: WorkflowEditorTab) => void;
  onExecute: () => void;
  readOnly?: boolean;
  backHref?: string;
  backLabel?: string;
  chatHref?: string;
  headerMeta?: ReactNode;
  saving?: boolean;
  onSave?: () => void;
  onOpenSettings?: () => void;
}

export function WorkflowEditorHeader({
  workflowName,
  status = "published",
  activeTab,
  onTabChange,
  onExecute,
  readOnly = false,
  backHref = "/dashboard/build/workflows",
  backLabel,
  chatHref,
  headerMeta,
  saving = false,
  onSave,
  onOpenSettings,
}: WorkflowEditorHeaderProps) {
  const te = useTranslations("WorkflowEditorPage");
  const tv = useTranslations("WorkflowViewPage");
  const breadcrumb = backLabel ?? (readOnly ? tv("back") : te("breadcrumb_workflows"));

  return (
    <header className="border-border bg-background flex h-12 shrink-0 items-center gap-2 border-b px-3">
      <WorkflowEditorHeaderLeft
        workflowName={workflowName}
        readOnly={readOnly}
        backHref={backHref}
        backLabel={breadcrumb}
        headerMeta={headerMeta}
      />
      <WorkflowEditorHeaderTabs
        activeTab={activeTab}
        readOnly={readOnly}
        onTabChange={onTabChange}
        onExecute={onExecute}
      />
      {readOnly ? (
        <WorkflowEditorHeaderViewActions chatHref={chatHref} onExecute={onExecute} />
      ) : (
        <WorkflowEditorHeaderEditActions
          status={status}
          saving={saving}
          onSave={onSave}
          onExecute={onExecute}
          onOpenSettings={onOpenSettings}
        />
      )}
    </header>
  );
}
