"use client";

import { memo } from "react";

import type { NodeProps } from "@xyflow/react";
import { ListFilter, Wrench } from "lucide-react";

import { SimpleNode } from "../_shared/simple-node";

export const TransformNode = memo((props: NodeProps) => {
  const data = props.data as { label?: string; deactivated?: boolean; transformKind?: string };
  const isFilter = data.transformKind === "filter";
  return (
    <SimpleNode
      label={String(data.label ?? (isFilter ? "Filter" : "Data transformation"))}
      icon={isFilter ? ListFilter : Wrench}
      accent={isFilter ? "border-sky-500/40" : "border-slate-500/40"}
      selected={props.selected}
      handleAccent={isFilter ? "!bg-sky-500" : "!bg-slate-500"}
      deactivated={data.deactivated}
    />
  );
});
TransformNode.displayName = "TransformNode";
