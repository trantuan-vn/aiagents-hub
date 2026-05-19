"use client";

import { memo } from "react";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Bot, Database, GitBranch, Layers, Play, UserCheck, Wrench, Zap } from "lucide-react";

import { cn } from "@/lib/utils";

const shell = (selected?: boolean, accent?: string) =>
  cn(
    "min-w-[200px] rounded-lg border bg-card px-3 py-2.5 text-sm shadow-md",
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
      <Handle type="target" position={Position.Left} className="!bg-violet-500" />
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
      <Handle type="source" position={Position.Right} className="!bg-violet-500" />
    </div>
  );
}

function SimpleNode({
  label,
  icon: Icon,
  accent,
  selected,
  handles = "both",
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  selected?: boolean;
  handles?: "both" | "source" | "target";
}) {
  return (
    <div className={shell(selected, accent)}>
      {handles !== "source" && <Handle type="target" position={Position.Left} />}
      <div className="flex items-center gap-2 font-medium">
        <Icon className="h-4 w-4 opacity-80" />
        {label}
      </div>
      {handles !== "target" && <Handle type="source" position={Position.Right} />}
    </div>
  );
}

export const TriggerNode = memo((props: NodeProps) => (
  <SimpleNode
    label={(props.data as { label?: string }).label ?? "Trigger"}
    icon={Play}
    accent="border-amber-500/40"
    selected={props.selected}
    handles="source"
  />
));
TriggerNode.displayName = "TriggerNode";

export const AgentWorkflowNode = memo(AgentNode);
AgentWorkflowNode.displayName = "AgentWorkflowNode";

export const HumanReviewNode = memo((props: NodeProps) => (
  <SimpleNode label="Human review" icon={UserCheck} accent="border-orange-500/40" selected={props.selected} />
));
HumanReviewNode.displayName = "HumanReviewNode";

export const FlowNode = memo((props: NodeProps) => (
  <SimpleNode label="Flow" icon={GitBranch} accent="border-sky-500/40" selected={props.selected} />
));
FlowNode.displayName = "FlowNode";

export const CoreNode = memo((props: NodeProps) => (
  <SimpleNode label="Core" icon={Layers} accent="border-emerald-500/40" selected={props.selected} />
));
CoreNode.displayName = "CoreNode";

export const ActionNode = memo((props: NodeProps) => (
  <SimpleNode label="Action in app" icon={Zap} accent="border-pink-500/40" selected={props.selected} />
));
ActionNode.displayName = "ActionNode";

export const TransformNode = memo((props: NodeProps) => (
  <SimpleNode label="Data transform" icon={Wrench} accent="border-slate-500/40" selected={props.selected} />
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
