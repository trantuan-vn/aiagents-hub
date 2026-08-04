"use client";

import { memo } from "react";

import type { NodeProps } from "@xyflow/react";
import { Database } from "lucide-react";

import { ResourceNode } from "../_shared/resource-node";

export const MemoryWorkflowNode = memo((props: NodeProps) => (
  <ResourceNode
    {...props}
    icon={Database}
    accent="border-emerald-500/40"
    handleAccent="!bg-emerald-500"
    handleId="memory"
    defaultLabel="Vectorize"
  />
));
MemoryWorkflowNode.displayName = "MemoryWorkflowNode";
