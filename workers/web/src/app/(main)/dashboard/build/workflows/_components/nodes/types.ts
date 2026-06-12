import type { ComponentType } from "react";

import type { Node, NodeProps } from "@xyflow/react";

import type { N8nNodeProperty } from "@/lib/n8n-workflow/types";

export type NodeConfigPanelProps = {
  node: Node;
  workflowId?: number;
  onClose: () => void;
  onPatchData: (nodeId: string, patch: Record<string, unknown>) => void;
  onExecuteStep?: (nodeId: string) => void;
};

export type WorkflowNodeCatalogCategory =
  | "trigger"
  | "core"
  | "flow"
  | "tool"
  | "memory"
  | "transform"
  | "human"
  | "action"
  | "ai";

export interface WorkflowNodeUIPlugin {
  id: string;
  runtimeType: string;
  kind?: string;
  Canvas: ComponentType<NodeProps>;
  ConfigPanel?: ComponentType<NodeConfigPanelProps>;
  defaults?: () => Record<string, unknown>;
  catalog: {
    category: WorkflowNodeCatalogCategory;
    labelKey: string;
    descriptionKey?: string;
    icon?: string;
    keywords?: string[];
    visible?: boolean;
  };
  n8nProperties?: N8nNodeProperty[];
  match?: (node: Node) => boolean;
}

export type GraphNode = Pick<Node, "id" | "type" | "data">;
