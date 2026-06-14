"use client";

import { Plus, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { useWorkflowCanvasUi } from "./workflow-canvas-ui-context";
import { useWorkflowEditorActions } from "../editor/workflow-editor-actions-context";

export function WorkflowCanvasEmptyState() {
  const t = useTranslations("WorkflowEditorPage");
  const actions = useWorkflowEditorActions();
  const openDrawer = useWorkflowCanvasUi()?.openAddNodeDrawer;

  if (!actions || actions.readOnly) return null;

  const { onAddNode, onOpenAiBuild } = actions;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="pointer-events-auto flex items-center gap-6">
        <button
          type="button"
          className="group flex flex-col items-center gap-2"
          onClick={() =>
            openDrawer?.({
              variant: "full",
              onPick: ({ type, label, extra }) => onAddNode(type, label, extra),
            })
          }
        >
          <span className="border-muted-foreground/40 bg-background/80 text-muted-foreground group-hover:border-foreground/50 group-hover:text-foreground flex size-[88px] items-center justify-center rounded-xl border border-dashed shadow-sm backdrop-blur-sm transition-colors">
            <Plus className="size-8 stroke-[1.5]" />
          </span>
          <span className="text-muted-foreground group-hover:text-foreground text-xs font-medium transition-colors">
            {t("empty_add_first_step")}
          </span>
        </button>

        <span className="text-muted-foreground text-xs">{t("empty_or")}</span>

        <button type="button" className="group flex flex-col items-center gap-2" onClick={() => onOpenAiBuild?.()}>
          <span className="border-muted-foreground/40 bg-background/80 text-muted-foreground group-hover:border-violet-500/50 group-hover:text-violet-700 dark:group-hover:text-violet-300 flex size-[88px] items-center justify-center rounded-xl border border-dashed shadow-sm backdrop-blur-sm transition-colors">
            <Sparkles className="size-7 stroke-[1.5]" />
          </span>
          <span className="text-muted-foreground group-hover:text-foreground text-xs font-medium transition-colors">
            {t("empty_build_with_ai")}
          </span>
        </button>
      </div>
    </div>
  );
}
