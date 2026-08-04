"use client";

import { memo } from "react";

import type { NodeProps } from "@xyflow/react";
import { Server } from "lucide-react";

import { ResourceNode } from "../_shared/resource-node";

export const ServiceWorkflowNode = memo((props: NodeProps) => (
  <ResourceNode
    {...props}
    icon={Server}
    accent="border-blue-500/40"
    handleAccent="!bg-blue-500"
    handleId="service"
    defaultLabel="Service"
  />
));
ServiceWorkflowNode.displayName = "ServiceWorkflowNode";
