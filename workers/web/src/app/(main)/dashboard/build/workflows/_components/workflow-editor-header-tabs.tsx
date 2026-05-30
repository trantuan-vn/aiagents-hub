"use client";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import type { WorkflowEditorTab } from "./workflow-editor-header";

interface WorkflowEditorHeaderTabsProps {
  activeTab: WorkflowEditorTab;
  readOnly: boolean;
  onTabChange: (tab: WorkflowEditorTab) => void;
}

export function WorkflowEditorHeaderTabs({
  activeTab,
  readOnly,
  onTabChange,
}: WorkflowEditorHeaderTabsProps) {
  const te = useTranslations("WorkflowEditorPage");

  const tabs: { id: WorkflowEditorTab; label: string; disabled?: boolean }[] = [
    { id: "editor", label: te("tab_editor") },
    { id: "executions", label: te("tab_executions") },
    { id: "triggers", label: te("tab_triggers"), disabled: readOnly },
    { id: "versions", label: te("tab_versions"), disabled: readOnly },
    { id: "evaluations", label: te("tab_evaluations"), disabled: readOnly },
  ];

  return (
    <div className="bg-muted hidden items-center rounded-lg p-0.5 sm:flex">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          disabled={tab.disabled}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-medium transition-colors",
            activeTab === tab.id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
            tab.disabled && "pointer-events-none opacity-40",
          )}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
