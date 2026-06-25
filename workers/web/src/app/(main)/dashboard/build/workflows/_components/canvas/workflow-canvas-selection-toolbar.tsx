"use client";

import { Panel, useStore, type Node } from "@xyflow/react";
import { Group, Ungroup, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  canGroupNodes,
  canUngroupNodes,
  isWorkflowGroupNode,
} from "../layout/workflow-node-group-utils";
import { useWorkflowCanvasUi } from "./workflow-canvas-ui-context";

const selectionSelector = (state: { nodes: Node[] }) => {
  const selected = state.nodes.filter((node) => node.selected);
  return {
    selectedCount: selected.length,
    selectedNodes: selected,
    allNodes: state.nodes,
  };
};

export function WorkflowCanvasSelectionToolbar() {
  const t = useTranslations("WorkflowEditorPage");
  const ui = useWorkflowCanvasUi();
  const { selectedCount, selectedNodes, allNodes } = useStore(selectionSelector);

  if (!ui || ui.readOnly || selectedCount === 0) return null;

  const showGroup = canGroupNodes(allNodes);
  const showUngroup = canUngroupNodes(allNodes);
  const groupCount = selectedNodes.filter((node) => !isWorkflowGroupNode(node)).length;

  if (!showGroup && !showUngroup && selectedCount < 2) return null;

  return (
    <Panel position="bottom-center" className="nodrag nopan !m-0 !mb-4 !p-0">
      <div
        className={cn(
          "bg-card/95 border-border flex items-center gap-1 rounded-lg border px-2 py-1.5 shadow-md backdrop-blur-sm",
        )}
        role="toolbar"
        aria-label={t("selection_toolbar")}
      >
        <span className="text-muted-foreground px-2 text-xs font-medium">
          {t("selection_count", { count: groupCount || selectedCount })}
        </span>

        {showGroup ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2.5 text-xs"
            onClick={() => ui.groupSelected?.()}
          >
            <Group className="size-3.5" aria-hidden />
            {t("group_nodes")}
          </Button>
        ) : null}

        {showUngroup ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2.5 text-xs"
            onClick={() => ui.ungroupSelected?.()}
          >
            <Ungroup className="size-3.5" aria-hidden />
            {t("ungroup_nodes")}
          </Button>
        ) : null}

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-muted-foreground size-8"
          aria-label={t("menu_clear_selection")}
          onClick={() => ui.clearSelection?.()}
        >
          <X className="size-3.5" aria-hidden />
        </Button>
      </div>
    </Panel>
  );
}
