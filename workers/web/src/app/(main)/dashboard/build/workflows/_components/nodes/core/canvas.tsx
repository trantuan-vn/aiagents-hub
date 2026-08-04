"use client";

import { memo } from "react";

import type { NodeProps } from "@xyflow/react";
import { Layers } from "lucide-react";

import { SimpleNode } from "../_shared/simple-node";

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
