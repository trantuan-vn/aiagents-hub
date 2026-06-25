"use client";

import { memo } from "react";

import { Position, useStore, type NodeProps } from "@xyflow/react";
import {
  AlertTriangle,
  Bot,
  Check,
  Database,
  GitBranch,
  Layers,
  Play,
  RotateCw,
  Server,
  UserCheck,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import { ConnectionHandle } from "../edges/connection-handle";
import { edgeUsesHandle, type WorkflowHandleId } from "../edges/workflow-connection-utils";
import { WorkflowNodeShell } from "../node-ui/workflow-node-shell";
import { WorkflowGroupNode } from "./workflow-group-node";
import { StickyNoteNode } from "./workflow-sticky-note-node";

function useAgentMissingConfig(nodeId: string | undefined) {
  const edges = useStore((s) => s.edges);
  if (!nodeId) return { missingService: true, missingMemory: true };

  const hasService = edges.some((e) => edgeUsesHandle(e, nodeId, "service", "target"));
  const hasMemory = edges.some((e) => edgeUsesHandle(e, nodeId, "memory", "target"));

  return { missingService: !hasService, missingMemory: !hasMemory };
}

function AgentNode({ id, data, selected }: NodeProps) {
  const t = useTranslations("WorkflowEditorPage");
  const d = data as { label?: string; deactivated?: boolean };
  const { missingService, missingMemory } = useAgentMissingConfig(id);
  const showWarning = missingService || missingMemory;

  return (
    <WorkflowNodeShell
      selected={selected}
      accent="border-violet-500/50"
      deactivated={d.deactivated}
      pill
      footer={
        <div className="border-border/60 -mx-1 mt-2 flex justify-around border-t pt-2">
          <ConnectionHandle
            handleId="service"
            type="target"
            position={Position.Bottom}
            accentClass="!bg-blue-500"
            label={t("handle_service")}
            shape="diamond"
            allowedNodeTypes={["service_node"]}
            required
          />
          <ConnectionHandle
            handleId="memory"
            type="target"
            position={Position.Bottom}
            accentClass="!bg-emerald-500"
            label={t("handle_memory")}
            shape="diamond"
            allowedNodeTypes={["memory_node"]}
          />
          <ConnectionHandle
            handleId="tools"
            type="target"
            position={Position.Bottom}
            accentClass="!bg-amber-500"
            label={t("handle_tools")}
            shape="diamond"
            allowedNodeTypes={["tool_node"]}
            allowMultipleConnections
          />
        </div>
      }
    >
      <ConnectionHandle handleId="in" type="target" position={Position.Left} accentClass="!bg-violet-500" />
      <div className="flex items-center justify-center gap-2 font-medium text-violet-700 dark:text-violet-300">
        <Bot className="h-4 w-4 shrink-0" />
        <span className="truncate">{d.label ?? "Agent"}</span>
        {showWarning ? (
          <AlertTriangle className="text-destructive h-4 w-4 shrink-0" aria-label={t("agent_config_warning")} />
        ) : null}
      </div>
      <ConnectionHandle handleId="out" type="source" position={Position.Right} accentClass="!bg-violet-500" />
    </WorkflowNodeShell>
  );
}

function ResourceNode({
  data,
  selected,
  icon: Icon,
  accent,
  handleAccent,
  handleId,
  defaultLabel,
}: NodeProps & {
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  handleAccent: string;
  handleId: "service" | "memory" | "tools";
  defaultLabel: string;
}) {
  const d = data as { label?: string; deactivated?: boolean; catalogId?: string };

  return (
    <WorkflowNodeShell selected={selected} accent={accent} deactivated={d.deactivated} pill>
      <ConnectionHandle
        handleId={handleId}
        type="source"
        position={Position.Top}
        accentClass={handleAccent}
        shape="diamond"
        showAddNode={false}
      />
      <div className="flex items-center justify-center gap-2 font-medium">
        <Icon className="h-4 w-4 shrink-0 opacity-80" />
        <span className="max-w-[160px] truncate">{d.label ?? defaultLabel}</span>
      </div>
    </WorkflowNodeShell>
  );
}

function SimpleNode({
  label,
  icon: Icon,
  accent,
  selected,
  handleAccent,
  deactivated,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  selected?: boolean;
  handleAccent: string;
  deactivated?: boolean;
}) {
  return (
    <WorkflowNodeShell selected={selected} accent={accent} deactivated={deactivated}>
      <ConnectionHandle handleId="in" type="target" position={Position.Left} accentClass={handleAccent} />
      <div className="flex items-center gap-2 font-medium">
        <Icon className="h-4 w-4 opacity-80" />
        {label}
      </div>
      <ConnectionHandle handleId="out" type="source" position={Position.Right} accentClass={handleAccent} />
    </WorkflowNodeShell>
  );
}

export const TriggerNode = memo((props: NodeProps) => (
  <SimpleNode
    label={(props.data as { label?: string }).label ?? "Trigger"}
    icon={Play}
    accent="border-amber-500/40"
    selected={props.selected}
    handleAccent="!bg-amber-500"
    deactivated={(props.data as { deactivated?: boolean }).deactivated}
  />
));
TriggerNode.displayName = "TriggerNode";

export const AgentWorkflowNode = memo(AgentNode);
AgentWorkflowNode.displayName = "AgentWorkflowNode";

export const ServiceWorkflowNode = memo((props: NodeProps) => (
  <ResourceNode
    {...props}
    icon={Server}
    accent="border-blue-500/40"
    handleAccent="!bg-blue-500"
    handleId="service"
    defaultLabel="Service"
  />
));
ServiceWorkflowNode.displayName = "ServiceWorkflowNode";

export const MemoryWorkflowNode = memo((props: NodeProps) => (
  <ResourceNode
    {...props}
    icon={Database}
    accent="border-emerald-500/40"
    handleAccent="!bg-emerald-500"
    handleId="memory"
    defaultLabel="Vectorize"
  />
));
MemoryWorkflowNode.displayName = "MemoryWorkflowNode";

function ToolNode({ data, selected }: NodeProps) {
  const d = data as { label?: string; deactivated?: boolean };

  return (
    <WorkflowNodeShell selected={selected} accent="border-amber-500/40" deactivated={d.deactivated} pill>
      <ConnectionHandle handleId="in" type="target" position={Position.Left} accentClass="!bg-amber-500" />
      <ConnectionHandle
        handleId="tools"
        type="source"
        position={Position.Top}
        accentClass="!bg-amber-500"
        shape="diamond"
        showAddNode={false}
        clusterClass="absolute left-1/2 top-0 z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5"
      />
      <div className="flex items-center justify-center gap-2 font-medium">
        <Wrench className="h-4 w-4 shrink-0 opacity-80" />
        <span className="max-w-[160px] truncate">{d.label ?? "Tool"}</span>
      </div>
      <ConnectionHandle handleId="out" type="source" position={Position.Right} accentClass="!bg-amber-500" />
    </WorkflowNodeShell>
  );
}

export const ToolWorkflowNode = memo(ToolNode);
ToolWorkflowNode.displayName = "ToolWorkflowNode";

export const HumanReviewNode = memo((props: NodeProps) => (
  <SimpleNode
    label={String((props.data as { label?: string }).label ?? "Human review")}
    icon={UserCheck}
    accent="border-orange-500/40"
    selected={props.selected}
    handleAccent="!bg-orange-500"
    deactivated={(props.data as { deactivated?: boolean }).deactivated}
  />
));
HumanReviewNode.displayName = "HumanReviewNode";

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

export const CoreNode = memo((props: NodeProps) => (
  <SimpleNode
    label={String((props.data as { label?: string }).label ?? "Core")}
    icon={Layers}
    accent="border-emerald-500/40"
    selected={props.selected}
    handleAccent="!bg-emerald-500"
    deactivated={(props.data as { deactivated?: boolean }).deactivated}
  />
));
CoreNode.displayName = "CoreNode";

export const ActionNode = memo((props: NodeProps) => (
  <SimpleNode
    label={String((props.data as { label?: string }).label ?? "Action in app")}
    icon={Zap}
    accent="border-pink-500/40"
    selected={props.selected}
    handleAccent="!bg-pink-500"
    deactivated={(props.data as { deactivated?: boolean }).deactivated}
  />
));
ActionNode.displayName = "ActionNode";

export const TransformNode = memo((props: NodeProps) => (
  <SimpleNode
    label={String((props.data as { label?: string }).label ?? "Data transformation")}
    icon={Wrench}
    accent="border-slate-500/40"
    selected={props.selected}
    handleAccent="!bg-slate-500"
    deactivated={(props.data as { deactivated?: boolean }).deactivated}
  />
));
TransformNode.displayName = "TransformNode";

export const workflowNodeTypes = {
  workflow_group: WorkflowGroupNode,
  agent: AgentWorkflowNode,
  service_node: ServiceWorkflowNode,
  memory_node: MemoryWorkflowNode,
  tool_node: ToolWorkflowNode,
  trigger: TriggerNode,
  human_review: HumanReviewNode,
  flow: FlowNode,
  core: CoreNode,
  action_in_app: ActionNode,
  data_transformation: TransformNode,
  sticky_note: StickyNoteNode,
};
