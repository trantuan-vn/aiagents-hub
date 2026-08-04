"use client";

import { memo } from "react";

import { Position, type NodeProps } from "@xyflow/react";
import { Check, GitBranch, RotateCw, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import { ConnectionHandle } from "../../edges/connection-handle";
import type { WorkflowHandleId } from "../../edges/workflow-connection-utils";
import { WorkflowNodeShell } from "../../node-ui/workflow-node-shell";
import { SimpleNode } from "../_shared/simple-node";

type BranchBadgeVariant = "true" | "false" | "case" | "default" | "loop" | "done";

function BranchBadge({
  variant,
  children,
}: {
  variant: BranchBadgeVariant;
  children: React.ReactNode;
}) {
  const styles: Record<BranchBadgeVariant, string> = {
    true: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    false: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
    case: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    default: "border-border bg-muted/60 text-muted-foreground",
    loop: "border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300",
    done: "border-border bg-muted/60 text-muted-foreground",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium leading-none",
        styles[variant],
      )}
    >
      {children}
    </span>
  );
}

function FlowBranchRow({
  badge,
  badgeVariant,
  handleId,
  handleAccent,
}: {
  badge: React.ReactNode;
  badgeVariant: BranchBadgeVariant;
  handleId: WorkflowHandleId;
  handleAccent: string;
}) {
  return (
    <div className="border-border/50 relative min-h-[38px] border-t px-3 py-2">
      <div className="flex items-center pl-0.5">
        <BranchBadge variant={badgeVariant}>{badge}</BranchBadge>
      </div>
      <ConnectionHandle
        handleId={handleId}
        type="source"
        position={Position.Right}
        accentClass={handleAccent}
      />
    </div>
  );
}

function FlowLoopOverItemsNode({
  label,
  selected,
  deactivated,
}: {
  label: string;
  selected?: boolean;
  deactivated?: boolean;
}) {
  const t = useTranslations("WorkflowEditorPage");

  const squareClass = cn(
    "relative h-[84px] w-[84px] rounded-[10px] border-2 border-border/80 bg-card shadow-sm",
    selected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
  );

  const sideHandleCluster = (top: string) =>
    `absolute right-0 z-20 flex translate-x-1/2 -translate-y-1/2 flex-row-reverse items-center gap-1.5 ${top}`;

  return (
    <WorkflowNodeShell compact selected={selected} deactivated={deactivated}>
      <div className="flex flex-col items-center">
        <div className={squareClass}>
          <ConnectionHandle
            handleId="in"
            type="target"
            position={Position.Left}
            accentClass="!bg-muted-foreground/80 !size-2.5"
            clusterClass="absolute left-0 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center"
          />
          <div className="flex h-full w-full items-center justify-center">
            <RotateCw
              className="h-[34px] w-[34px] text-[#1a6b5c] dark:text-teal-400"
              strokeWidth={1.75}
              aria-hidden
            />
          </div>
          <ConnectionHandle
            handleId="done"
            type="source"
            position={Position.Right}
            accentClass="!bg-muted-foreground/80 !size-2.5"
            clusterClass={sideHandleCluster("top-[26%]")}
            label={t("flow_branch_done")}
          />
          <ConnectionHandle
            handleId="loop"
            type="source"
            position={Position.Right}
            accentClass="!bg-muted-foreground/80 !size-2.5"
            clusterClass={sideHandleCluster("top-[74%]")}
            label={t("flow_branch_loop")}
          />
        </div>
        <p
          className="text-foreground/85 mt-2 max-w-[172px] truncate text-center text-[11px] leading-snug font-medium"
          title={label}
        >
          {label}
        </p>
      </div>
    </WorkflowNodeShell>
  );
}

function FlowIfNode({
  label,
  selected,
  deactivated,
}: {
  label: string;
  selected?: boolean;
  deactivated?: boolean;
}) {
  const t = useTranslations("WorkflowEditorPage");

  return (
    <WorkflowNodeShell selected={selected} accent="border-sky-500/40" deactivated={deactivated}>
      <div className="-mx-3 -mt-2.5 min-w-[228px]">
        <div className="relative flex items-center gap-2.5 px-3 py-2.5">
          <ConnectionHandle handleId="in" type="target" position={Position.Left} accentClass="!bg-sky-500" />
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-sky-500/15">
            <GitBranch className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
          </div>
          <span className="truncate font-medium">{label}</span>
        </div>
        <FlowBranchRow
          badge={
            <>
              <Check className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
              {t("flow_branch_true")}
            </>
          }
          badgeVariant="true"
          handleId="true"
          handleAccent="!bg-emerald-500"
        />
        <FlowBranchRow
          badge={
            <>
              <X className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
              {t("flow_branch_false")}
            </>
          }
          badgeVariant="false"
          handleId="false"
          handleAccent="!bg-red-500"
        />
      </div>
    </WorkflowNodeShell>
  );
}

function FlowSwitchNode({
  label,
  selected,
  deactivated,
  caseCount = 2,
}: {
  label: string;
  selected?: boolean;
  deactivated?: boolean;
  caseCount?: number;
}) {
  const t = useTranslations("WorkflowEditorPage");
  const cases = Math.max(1, Math.min(caseCount, 6));

  return (
    <WorkflowNodeShell selected={selected} accent="border-sky-500/40" deactivated={deactivated}>
      <div className="-mx-3 -mt-2.5 min-w-[228px]">
        <div className="relative flex items-center gap-2.5 px-3 py-2.5">
          <ConnectionHandle handleId="in" type="target" position={Position.Left} accentClass="!bg-sky-500" />
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-sky-500/15">
            <GitBranch className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
          </div>
          <span className="truncate font-medium">{label}</span>
        </div>
        {Array.from({ length: cases }, (_, i) => (
          <FlowBranchRow
            key={`case_${i}`}
            badge={`${t("flow_branch_case")} ${i + 1}`}
            badgeVariant="case"
            handleId={`case_${i}`}
            handleAccent="!bg-sky-400"
          />
        ))}
        <FlowBranchRow
          badge={t("flow_branch_default")}
          badgeVariant="default"
          handleId="default"
          handleAccent="!bg-slate-400"
        />
      </div>
    </WorkflowNodeShell>
  );
}

export const FlowNode = memo((props: NodeProps) => {
  const d = props.data as {
    label?: string;
    deactivated?: boolean;
    flowKind?: string;
    switchCases?: number;
  };
  const flowKind = d.flowKind ?? "if";
  const label = d.label ?? "Flow";

  if (flowKind === "if") {
    return (
      <FlowIfNode
        label={String(label)}
        selected={props.selected}
        deactivated={d.deactivated}
      />
    );
  }

  if (flowKind === "switch") {
    return (
      <FlowSwitchNode
        label={String(label)}
        selected={props.selected}
        deactivated={d.deactivated}
        caseCount={typeof d.switchCases === "number" ? d.switchCases : 2}
      />
    );
  }

  if (flowKind === "loop_over_items") {
    return (
      <FlowLoopOverItemsNode
        label={String(label)}
        selected={props.selected}
        deactivated={d.deactivated}
      />
    );
  }

  return (
    <SimpleNode
      label={String(label)}
      icon={GitBranch}
      accent="border-sky-500/40"
      selected={props.selected}
      handleAccent="!bg-sky-500"
      deactivated={d.deactivated}
    />
  );
});
FlowNode.displayName = "FlowNode";
