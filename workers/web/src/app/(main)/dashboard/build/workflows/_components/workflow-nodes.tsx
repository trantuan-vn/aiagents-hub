"use client";

import { memo } from "react";

import { Position, useStore, type NodeProps } from "@xyflow/react";
import { AlertTriangle, Bot, Database, GitBranch, Layers, Play, Server, UserCheck, Wrench, Zap } from "lucide-react";
import { useTranslations } from "next-intl";

import { ConnectionHandle } from "./connection-handle";
import { edgeUsesHandle } from "./workflow-connection-utils";
import { WorkflowNodeShell } from "./workflow-node-shell";
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
    defaultLabel="Memory"
  />
));
MemoryWorkflowNode.displayName = "MemoryWorkflowNode";

export const ToolWorkflowNode = memo((props: NodeProps) => (
  <ResourceNode
    {...props}
    icon={Wrench}
    accent="border-amber-500/40"
    handleAccent="!bg-amber-500"
    handleId="tools"
    defaultLabel="Tool"
  />
));
ToolWorkflowNode.displayName = "ToolWorkflowNode";

export const HumanReviewNode = memo((props: NodeProps) => (
  <SimpleNode
    label="Human review"
    icon={UserCheck}
    accent="border-orange-500/40"
    selected={props.selected}
    handleAccent="!bg-orange-500"
    deactivated={(props.data as { deactivated?: boolean }).deactivated}
  />
));
HumanReviewNode.displayName = "HumanReviewNode";

export const FlowNode = memo((props: NodeProps) => (
  <SimpleNode
    label="Flow"
    icon={GitBranch}
    accent="border-sky-500/40"
    selected={props.selected}
    handleAccent="!bg-sky-500"
    deactivated={(props.data as { deactivated?: boolean }).deactivated}
  />
));
FlowNode.displayName = "FlowNode";

export const CoreNode = memo((props: NodeProps) => (
  <SimpleNode
    label="Core"
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
    label="Action in app"
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
    label="Data transform"
    icon={Wrench}
    accent="border-slate-500/40"
    selected={props.selected}
    handleAccent="!bg-slate-500"
    deactivated={(props.data as { deactivated?: boolean }).deactivated}
  />
));
TransformNode.displayName = "TransformNode";

export const workflowNodeTypes = {
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
