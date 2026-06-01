"use client";

import { useState, type ReactNode } from "react";

import { Panel } from "@xyflow/react";
import { Plus, Search, Sparkles, StickyNote } from "lucide-react";
import { useTranslations } from "next-intl";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { WorkflowAddNodePanel } from "./workflow-add-node-panel";
import { WorkflowCanvasSearchPanel } from "./workflow-canvas-search-panel";
import { useWorkflowEditorActions } from "./workflow-editor-actions-context";

const iconClass = "size-[15px] shrink-0 stroke-[1.75]";

function ToolbarButton({
  label,
  onClick,
  active,
  className,
  children,
}: {
  label: string;
  onClick?: () => void;
  active?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "text-muted-foreground hover:bg-muted hover:text-foreground flex size-8 items-center justify-center transition-colors",
            active && "bg-muted text-foreground",
            className,
          )}
          aria-label={label}
          onClick={onClick}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  );
}

export function WorkflowCanvasSideToolbar() {
  const t = useTranslations("WorkflowEditorPage");
  const actions = useWorkflowEditorActions();
  const [searchOpen, setSearchOpen] = useState(false);

  if (!actions || actions.readOnly) return null;

  const { onAddNode, onAddStickyNote, aiOpen, onToggleAi, serviceEndpoint } = actions;
  const [addNodeOpen, setAddNodeOpen] = useState(false);

  return (
    <Panel position="top-right" className="!m-3 !p-0">
      <div
        className="bg-card/95 border-border flex flex-col overflow-hidden rounded-lg border shadow-sm backdrop-blur-sm"
        role="toolbar"
        aria-label={t("canvas_toolbar")}
      >
        <>
            <Popover open={addNodeOpen} onOpenChange={setAddNodeOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="text-muted-foreground hover:bg-muted hover:text-foreground flex size-8 items-center justify-center transition-colors"
                  aria-label={t("add_node")}
                >
                  <Plus className={iconClass} aria-hidden />
                </button>
              </PopoverTrigger>
              <PopoverContent side="left" align="start" className="w-auto p-0">
                <WorkflowAddNodePanel
                  key={addNodeOpen ? "open" : "closed"}
                  onPick={({ type, label, extra }) => {
                    onAddNode(type, label, extra);
                    setAddNodeOpen(false);
                  }}
                />
              </PopoverContent>
            </Popover>

            <div className="bg-border h-px w-full" />

            <Popover open={searchOpen} onOpenChange={setSearchOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "text-muted-foreground hover:bg-muted hover:text-foreground flex size-8 items-center justify-center transition-colors",
                    searchOpen && "bg-muted text-foreground",
                  )}
                  aria-label={t("search_components")}
                >
                  <Search className={iconClass} aria-hidden />
                </button>
              </PopoverTrigger>
              <PopoverContent side="left" align="start" className="w-auto p-0">
                <WorkflowCanvasSearchPanel
                  serviceEndpoint={serviceEndpoint}
                  onPickNode={(type, label, extra) => {
                    onAddNode(type, label, extra);
                    setSearchOpen(false);
                  }}
                />
              </PopoverContent>
            </Popover>

            <ToolbarButton label={t("add_sticky_note")} onClick={onAddStickyNote}>
              <StickyNote className={iconClass} aria-hidden />
            </ToolbarButton>

            <div className="bg-border h-px w-full" />

            <ToolbarButton
              label={t("ai_title")}
              onClick={onToggleAi}
              active={aiOpen}
              className={aiOpen ? "text-violet-600 dark:text-violet-400" : undefined}
            >
              <Sparkles className={iconClass} aria-hidden />
            </ToolbarButton>
        </>
      </div>
    </Panel>
  );
}
