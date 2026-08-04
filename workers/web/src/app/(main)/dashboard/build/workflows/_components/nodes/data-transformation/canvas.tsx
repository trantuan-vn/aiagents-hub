"use client";

import { memo } from "react";

import type { NodeProps } from "@xyflow/react";
import { Wrench } from "lucide-react";

import { SimpleNode } from "../_shared/simple-node";

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
