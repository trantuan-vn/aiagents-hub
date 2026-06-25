"use client";

import { memo, useCallback } from "react";

import { NodeToolbar, Position } from "@xyflow/react";
import {
  Copy,
  Eraser,
  GitBranch,
  Group,
  MoreHorizontal,
  Play,
  Power,
  PowerOff,
  RefreshCw,
  Scissors,
  Trash2,
  Type,
  Ungroup,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { useWorkflowCanvasUi } from "../canvas/workflow-canvas-ui-context";

interface WorkflowNodeToolbarProps {
  nodeId: string;
  deactivated?: boolean;
  visible?: boolean;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  onMenuOpenChange?: (open: boolean) => void;
}

function WorkflowNodeToolbarInner({
  nodeId,
  deactivated,
  visible,
  onPointerEnter,
  onPointerLeave,
  onMenuOpenChange,
}: WorkflowNodeToolbarProps) {
  const t = useTranslations("WorkflowEditorPage");
  const ui = useWorkflowCanvasUi();
  const readOnly = ui?.readOnly ?? true;

  const onRun = useCallback(() => ui?.runNode?.(nodeId), [ui, nodeId]);
  const onToggleActive = useCallback(() => ui?.toggleNodeActive?.(nodeId), [ui, nodeId]);
  const onDelete = useCallback(() => ui?.deleteNode?.(nodeId), [ui, nodeId]);
  const onMenuAction = useCallback((action: string) => ui?.onNodeMenuAction?.(nodeId, action), [ui, nodeId]);

  if (readOnly) return null;

  return (
    <NodeToolbar
      isVisible={visible}
      position={Position.Top}
      align="center"
      offset={4}
      className="nodrag nopan"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <div className="flex items-center gap-0.5 rounded-md border bg-card p-0.5 shadow-md">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label={t("toolbar_run")}
          onClick={onRun}
        >
          <Play className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("h-7 w-7", deactivated && "text-muted-foreground")}
          aria-label={deactivated ? t("toolbar_activate") : t("toolbar_deactivate")}
          onClick={onToggleActive}
        >
          {deactivated ? <Power className="h-3.5 w-3.5" /> : <PowerOff className="h-3.5 w-3.5" />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-destructive hover:text-destructive h-7 w-7"
          aria-label={t("toolbar_delete")}
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
        <DropdownMenu onOpenChange={onMenuOpenChange}>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={t("toolbar_more")}>
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-56">
            <DropdownMenuItem onClick={() => onMenuAction("open")}>{t("menu_open")}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onMenuAction("execute_step")}>{t("menu_execute_step")}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onMenuAction("rename")}>
              <Type className="mr-2 h-4 w-4" />
              {t("menu_rename")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onMenuAction("replace")}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {t("menu_replace")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onMenuAction("deactivate")}>
              <PowerOff className="mr-2 h-4 w-4" />
              {t("menu_deactivate")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onMenuAction("copy")}>
              <Copy className="mr-2 h-4 w-4" />
              {t("menu_copy")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onMenuAction("duplicate")}>
              <Copy className="mr-2 h-4 w-4" />
              {t("menu_duplicate")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onMenuAction("group")}>
              <Group className="mr-2 h-4 w-4" />
              {t("menu_group")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onMenuAction("ungroup")}>
              <Ungroup className="mr-2 h-4 w-4" />
              {t("menu_ungroup")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => ui?.tidyLayout?.()}>{t("menu_tidy")}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onMenuAction("convert_subworkflow")}>
              <GitBranch className="mr-2 h-4 w-4" />
              {t("menu_convert_subworkflow")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onMenuAction("select_all")}>{t("menu_select_all")}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onMenuAction("clear_selection")}>
              <Eraser className="mr-2 h-4 w-4" />
              {t("menu_clear_selection")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
              <Scissors className="mr-2 h-4 w-4" />
              {t("menu_delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </NodeToolbar>
  );
}

export const WorkflowNodeToolbar = memo(WorkflowNodeToolbarInner);
WorkflowNodeToolbar.displayName = "WorkflowNodeToolbar";
