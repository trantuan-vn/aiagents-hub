"use client";

import { memo } from "react";

import type { NodeProps } from "@xyflow/react";
import { isSimpleMemoryKind } from "@aiagents-hub/workflow-nodes";
import { Database } from "lucide-react";

import { ResourceNode } from "../_shared/resource-node";

export const MemoryWorkflowNode = memo((props: NodeProps) => {
  const data = (props.data ?? {}) as Record<string, unknown>;
  const simple = isSimpleMemoryKind(data.memoryKind);

  return (
    <ResourceNode
      {...props}
      icon={Database}
      accent={simple ? "border-muted" : "border-emerald-500/40"}
      handleAccent="!bg-emerald-500"
      handleId="memory"
      defaultLabel={simple ? "Simple Memory" : "Vectorize"}
      variant={simple ? "circle" : "pill"}
    />
  );
});
MemoryWorkflowNode.displayName = "MemoryWorkflowNode";
