"use client";

import { Settings2, Sparkles, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { WorkflowBuildPanel } from "../panels/workflow-panels/workflow-build-panel";

interface WorkflowEditorAiSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenSettings?: () => void;
  onApplyDefinition: (definitionJson: string) => void;
  className?: string;
}

export function WorkflowEditorAiSidebar({
  open,
  onOpenChange,
  onOpenSettings,
  onApplyDefinition,
  className,
}: WorkflowEditorAiSidebarProps) {
  const t = useTranslations("WorkflowEditorPage");

  if (!open) return null;

  return (
    <aside
      className={cn(
        "border-border bg-background isolate flex w-[min(100%,400px)] shrink-0 flex-col border-l shadow-sm",
        className,
      )}
    >
      <header className="border-border flex shrink-0 items-start gap-3 border-b px-4 py-3.5">
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:bg-violet-400/10 dark:text-violet-400"
          aria-hidden
        >
          <Sparkles className="size-4" />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <h2 className="text-foreground text-sm font-semibold leading-none tracking-tight">{t("ai_title")}</h2>
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">{t("ai_subtitle")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {onOpenSettings ? (
            <Button type="button" variant="ghost" size="icon" className="size-8" onClick={onOpenSettings}>
              <Settings2 className="size-4" />
              <span className="sr-only">{t("settings_title")}</span>
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => onOpenChange(false)}>
            <X className="size-4" />
            <span className="sr-only">{t("ai_close")}</span>
          </Button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
        <WorkflowBuildPanel onApplyDefinition={onApplyDefinition} />
      </div>
    </aside>
  );
}
