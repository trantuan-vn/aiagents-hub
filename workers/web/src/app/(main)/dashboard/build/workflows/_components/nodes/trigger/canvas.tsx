"use client";

import { memo } from "react";

import type { NodeProps } from "@xyflow/react";
import { Play } from "lucide-react";

import { SimpleNode } from "../_shared/simple-node";

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
