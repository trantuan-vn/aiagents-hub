"use client";

import { useState } from "react";

import { Settings2, Sparkles, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { WorkflowBuildPanel } from "./workflow-build-panel";
import { WorkflowChat } from "./workflow-chat";

interface WorkflowEditorAiSidebarProps {
  workflowId: number;
  workflowName: string;
  ownerId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenSettings?: () => void;
  onApplyDefinition?: (definitionJson: string) => void;
  className?: string;
}

export function WorkflowEditorAiSidebar({
  workflowId,
  workflowName,
  ownerId,
  open,
  onOpenChange,
  onOpenSettings,
  onApplyDefinition,
  className,
}: WorkflowEditorAiSidebarProps) {
  const t = useTranslations("WorkflowEditorPage");
  const [mode, setMode] = useState<"ask" | "build">("ask");

  if (!open) return null;

  return (
    <aside
      className={cn(
        "border-border bg-background flex w-[min(100%,380px)] shrink-0 flex-col border-l",
        className,
      )}
    >
      <div className="border-border flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Sparkles className="text-violet-600 size-4 shrink-0 dark:text-violet-400" aria-hidden />
          <span className="truncate text-sm font-semibold">{t("ai_title")}</span>
        </div>
        <div className="bg-muted flex rounded-md p-0.5 text-xs">
          <button
            type="button"
            className={cn(
              "rounded px-2 py-0.5 font-medium transition-colors",
              mode === "ask" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setMode("ask")}
          >
            {t("ai_tab_ask")}
          </button>
          <button
            type="button"
            className={cn(
              "rounded px-2 py-0.5 font-medium transition-colors",
              mode === "build" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setMode("build")}
          >
            {t("ai_tab_build")}
          </button>
        </div>
        {onOpenSettings ? (
          <Button type="button" variant="ghost" size="icon" className="size-7" onClick={onOpenSettings}>
            <Settings2 className="size-3.5" />
            <span className="sr-only">{t("settings_title")}</span>
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => onOpenChange(false)}>
          <X className="size-3.5" />
          <span className="sr-only">{t("ai_close")}</span>
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-3">
        {mode === "build" && onApplyDefinition ? (
          <WorkflowBuildPanel workflowId={workflowId} onApplyDefinition={onApplyDefinition} />
        ) : (
          <WorkflowChat
            workflowId={workflowId}
            workflowName={workflowName}
            ownerId={ownerId}
            variant="sidebar"
            mode={mode}
          />
        )}
      </div>
    </aside>
  );
}
