"use client";

import { memo } from "react";

import { Position, type NodeProps } from "@xyflow/react";
import { Bot, Database, GitBranch, Layers, Play, UserCheck, Wrench, Zap } from "lucide-react";

import { cn } from "@/lib/utils";

import { ConnectionHandle } from "./connection-handle";

const shell = (selected?: boolean, accent?: string) =>
  cn(
    "relative min-w-[200px] rounded-lg border bg-card px-3 py-2.5 text-sm shadow-md",
    accent,
    selected && "ring-2 ring-primary",
  );

function AgentNode({ data, selected }: NodeProps) {
  const d = data as {
    label?: string;
    serviceEndpoint?: string;
    memoryCollection?: string;
  };
  return (
    <div className={shell(selected, "border-violet-500/40")}>
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
    </div>
  );
}

function SimpleNode({
  label,
  icon: Icon,
  accent,
  selected,
  handleAccent,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  selected?: boolean;
  handleAccent: string;
}) {
  return (
    <div className={shell(selected, accent)}>
      <ConnectionHandle handleId="in" type="target" position={Position.Left} accentClass={handleAccent} />
      <div className="flex items-center gap-2 font-medium">
        <Icon className="h-4 w-4 opacity-80" />
        {label}
      </div>
      <ConnectionHandle handleId="out" type="source" position={Position.Right} accentClass={handleAccent} />
    </div>
  );
}

export const TriggerNode = memo((props: NodeProps) => (
  <SimpleNode
    label={(props.data as { label?: string }).label ?? "Trigger"}
    icon={Play}
    accent="border-amber-500/40"
    selected={props.selected}
    handleAccent="!bg-amber-500"
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
