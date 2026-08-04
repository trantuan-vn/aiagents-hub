"use client";

import { memo } from "react";

import type { NodeProps } from "@xyflow/react";
import { UserCheck } from "lucide-react";

import { SimpleNode } from "../_shared/simple-node";

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
