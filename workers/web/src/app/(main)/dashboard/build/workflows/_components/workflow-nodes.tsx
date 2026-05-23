"use client";

import { memo } from "react";

import { Position, type NodeProps } from "@xyflow/react";
import { Bot, Database, GitBranch, Layers, Play, UserCheck, Wrench, Zap } from "lucide-react";
import { useTranslations } from "next-intl";

import { ConnectionHandle } from "./connection-handle";
import { WorkflowNodeShell } from "./workflow-node-shell";

function AgentNode({ data, selected }: NodeProps) {
  const t = useTranslations("WorkflowEditorPage");
  const d = data as {
    label?: string;
    serviceEndpoint?: string;
    memoryCollection?: string;
    deactivated?: boolean;
  };

  return (
    <WorkflowNodeShell selected={selected} accent="border-violet-500/40" deactivated={d.deactivated}>
      <ConnectionHandle handleId="in" type="target" position={Position.Left} accentClass="!bg-violet-500" />
      <div className="flex items-center gap-2 font-medium text-violet-700 dark:text-violet-300">
        <Bot className="h-4 w-4" />
        {d.label ?? "Agent"}
      </div>
      {d.serviceEndpoint ? <p className="text-muted-foreground mt-1 truncate text-xs">{d.serviceEndpoint}</p> : null}
      {d.memoryCollection ? (
        <p className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs">
          <Database className="h-3 w-3" />
          {d.memoryCollection}
        </p>
      ) : null}
      <ConnectionHandle handleId="out" type="source" position={Position.Right} accentClass="!bg-violet-500" />
      <div className="border-border/60 mt-3 flex justify-around border-t pt-2">
        <ConnectionHandle
          handleId="service"
          type="target"
          position={Position.Bottom}
          accentClass="!bg-blue-500"
          label={t("handle_service")}
          showAddNode={false}
        />
        <ConnectionHandle
          handleId="memory"
          type="target"
          position={Position.Bottom}
          accentClass="!bg-emerald-500"
          label={t("handle_memory")}
          showAddNode={false}
        />
        <ConnectionHandle
          handleId="tools"
          type="target"
          position={Position.Bottom}
          accentClass="!bg-amber-500"
          label={t("handle_tools")}
          showAddNode={false}
        />
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
  trigger: TriggerNode,
  human_review: HumanReviewNode,
  flow: FlowNode,
  core: CoreNode,
  action_in_app: ActionNode,
  data_transformation: TransformNode,
};
