"use client";

import { useEffect, useMemo, useState } from "react";

import { Panel } from "@xyflow/react";
import type { Edge, Node } from "@xyflow/react";
import { Check, ChevronDown, FlaskConical, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { WORKFLOW_TRIGGER_CATALOG, type WorkflowTriggerKindId } from "../catalogs/workflow-trigger-catalog";
import {
  entryPointNeedsNodeLabel,
  getWorkflowTriggerEntryPoints,
  pickDefaultEntryPoint,
  type WorkflowExecuteEntryPoint,
} from "./workflow-execute-entry-points";

const TRIGGER_ICON_COLORS: Partial<Record<WorkflowTriggerKindId | "manual", string>> = {
  manual: "text-amber-500",
  webhook: "text-rose-500",
  form: "text-sky-500",
  schedule: "text-violet-500",
  chat: "text-emerald-500",
  sub_workflow: "text-orange-500",
  evaluation: "text-indigo-500",
  app_event: "text-blue-500",
  other: "text-slate-500",
};

interface WorkflowCanvasExecutePanelProps {
  nodes: Node[];
  edges: Edge[];
  running?: boolean;
  webhookListening?: boolean;
  onExecuteTriggerNode: (nodeId: string) => void;
}

function entryPointKey(kind: WorkflowTriggerKindId | "manual"): `execute_from_${WorkflowTriggerKindId | "manual"}` {
  return `execute_from_${kind}`;
}

function formatEntryLabel(
  point: WorkflowExecuteEntryPoint,
  entryPoints: WorkflowExecuteEntryPoint[],
  t: ReturnType<typeof useTranslations<"WorkflowEditorPage">>,
): string {
  const base = t(entryPointKey(point.kind));
  if (entryPointNeedsNodeLabel(entryPoints, point.kind) && point.nodeLabel) {
    return `${base} (${point.nodeLabel})`;
  }
  return base;
}

export function WorkflowCanvasExecutePanel({
  nodes,
  edges,
  running = false,
  webhookListening = false,
  onExecuteTriggerNode,
}: WorkflowCanvasExecutePanelProps) {
  const t = useTranslations("WorkflowEditorPage");
  const entryPoints = useMemo(() => getWorkflowTriggerEntryPoints(nodes, edges), [nodes, edges]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    () => pickDefaultEntryPoint(entryPoints)?.nodeId ?? null,
  );

  useEffect(() => {
    const ids = new Set(entryPoints.map((point) => point.nodeId));
    if (!selectedNodeId || !ids.has(selectedNodeId)) {
      setSelectedNodeId(pickDefaultEntryPoint(entryPoints)?.nodeId ?? null);
    }
  }, [entryPoints, selectedNodeId]);

  const selected = entryPoints.find((point) => point.nodeId === selectedNodeId) ?? pickDefaultEntryPoint(entryPoints);

  const triggerCatalogById = useMemo(
    () => new Map(WORKFLOW_TRIGGER_CATALOG.map((item) => [item.id, item])),
    [],
  );

  if (!selected || entryPoints.length === 0) return null;

  const hasMultipleTriggers = entryPoints.length > 1;

  const renderEntryIcon = (kind: WorkflowTriggerKindId | "manual") => {
    const catalogItem = kind === "manual" ? WORKFLOW_TRIGGER_CATALOG[0] : triggerCatalogById.get(kind);
    const Icon = catalogItem?.icon ?? FlaskConical;
    return <Icon className={cn("size-4 shrink-0", TRIGGER_ICON_COLORS[kind] ?? "text-muted-foreground")} aria-hidden />;
  };

  const fromLabel = webhookListening ? t("webhook_execute_listening") : formatEntryLabel(selected, entryPoints, t);

  const mainButton = (
    <button
      type="button"
      disabled={running && !webhookListening}
      onClick={() => onExecuteTriggerNode(selected.nodeId)}
      onPointerDown={(event) => event.stopPropagation()}
      className={cn(
        webhookListening ? "bg-[#eb5262] hover:bg-[#d94558]" : "bg-[#ff6d00] hover:bg-[#f57c00]",
        "disabled:opacity-80 flex h-10 items-center gap-2.5 px-4 text-left text-white transition-colors",
        hasMultipleTriggers ? "rounded-l-full pl-4 pr-3" : "rounded-full px-5",
      )}
    >
      {running && !webhookListening ? (
        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
      ) : (
        <FlaskConical className="size-4 shrink-0 stroke-[1.75]" aria-hidden />
      )}
      <span className="flex min-w-0 flex-col leading-none">
        <span className="text-[13px] font-semibold tracking-tight">
          {webhookListening ? t("webhook_stop_listening_short") : t("execute_workflow")}
        </span>
        <span className="mt-0.5 text-[11px] font-normal text-white/80">{fromLabel}</span>
      </span>
    </button>
  );

  return (
    <Panel position="bottom-center" className="nodrag nopan !m-4 !p-0">
      <div
        className="nodrag nopan inline-flex overflow-hidden rounded-full shadow-[0_4px_14px_rgba(0,0,0,0.22)]"
        role="group"
        aria-label={t("execute_workflow")}
      >
        {hasMultipleTriggers ? (
          <>
            {mainButton}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={running}
                  onPointerDown={(event) => event.stopPropagation()}
                  className="bg-[#e65100] hover:bg-[#d84315] disabled:opacity-80 border-[#bf360c]/40 flex h-10 w-9 shrink-0 items-center justify-center border-l text-white transition-colors"
                  aria-label={t("execute_workflow_choose_trigger")}
                >
                  <ChevronDown className="size-3.5" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="center" sideOffset={10} className="min-w-[14rem] p-1">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-muted-foreground px-2 py-1.5 text-[11px] font-medium tracking-wide uppercase">
                    {t("execute_trigger_group")}
                  </DropdownMenuLabel>
                  {entryPoints.map((point) => {
                    const isSelected = point.nodeId === selected.nodeId;
                    return (
                      <DropdownMenuItem
                        key={point.nodeId}
                        className="gap-2.5 rounded-md py-2 pr-2 pl-2.5"
                        onSelect={() => setSelectedNodeId(point.nodeId)}
                      >
                        {renderEntryIcon(point.kind)}
                        <span className="flex-1 text-sm">{formatEntryLabel(point, entryPoints, t)}</span>
                        {isSelected ? <Check className="text-muted-foreground size-4 shrink-0" aria-hidden /> : null}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : (
          mainButton
        )}
      </div>
    </Panel>
  );
}
