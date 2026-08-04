"use client";

import { memo } from "react";

import type { NodeProps } from "@xyflow/react";
import { Zap } from "lucide-react";

import { SimpleNode } from "../_shared/simple-node";

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
