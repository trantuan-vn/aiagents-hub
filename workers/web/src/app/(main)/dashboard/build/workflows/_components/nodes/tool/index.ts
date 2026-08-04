import {
  TOOL_KIND_DEFAULTS,
  TOOL_KINDS,
  TOOL_OVERRIDE_KINDS,
  type ToolKind,
} from "@aiagents-hub/workflow-nodes";

import type { WorkflowNodeUIPlugin } from "../types";
import { ToolWorkflowNode } from "./canvas";

export { ToolWorkflowNode } from "./canvas";

function toolLabelKey(kind: ToolKind): string {
  switch (kind) {
    case "save-rag":
      return "tool_save_rag";
    case "get-rag":
      return "tool_get_rag";
    case "get-db-info":
      return "tool_get_db_info";
    case "agent":
      return "tool_pick_agent";
    case "workflow":
      return "tool_pick_workflow";
    case "code":
      return "tool_pick_code";
    case "http_request":
      return "tool_pick_http";
    case "mcp":
      return "tool_category_mcp";
    default:
      return `tool_kind_${kind}`;
  }
}

function toolDescKey(kind: ToolKind): string {
  return `${toolLabelKey(kind)}_desc`;
}

/** Base tool_node — hidden; kind plugins are catalog entries. */
export const toolUIPlugin: WorkflowNodeUIPlugin = {
  id: "tool_node",
  runtimeType: "tool_node",
  Canvas: ToolWorkflowNode,
  defaults: () => ({ label: "Tool" }),
  catalog: {
    category: "tool",
    labelKey: "node_tool",
    descriptionKey: "node_tool_desc",
    icon: "Wrench",
    visible: false,
  },
};

export function createToolKindUIPlugin(kind: ToolKind): WorkflowNodeUIPlugin {
  const defaults = TOOL_KIND_DEFAULTS[kind] ?? {};
  return {
    id: `tool_node:${kind}`,
    runtimeType: "tool_node",
    kind,
    Canvas: ToolWorkflowNode,
    defaults: () => ({
      label: kind.replace(/-/g, " "),
      toolKind: kind,
      ...defaults,
    }),
    catalog: {
      category: "tool",
      labelKey: toolLabelKey(kind),
      descriptionKey: toolDescKey(kind),
      icon: "Wrench",
      keywords: [kind, "tool"],
    },
  };
}

export const TOOL_KIND_UI_PLUGINS: WorkflowNodeUIPlugin[] = TOOL_KINDS.filter(
  (kind) => !TOOL_OVERRIDE_KINDS.has(kind),
).map(createToolKindUIPlugin);

/** Override UI plugins for RAG tools (richer defaults). */
export const toolSaveRagUIPlugin: WorkflowNodeUIPlugin = createToolKindUIPlugin("save-rag");
export const toolGetRagUIPlugin: WorkflowNodeUIPlugin = createToolKindUIPlugin("get-rag");
export const toolGetDbInfoUIPlugin: WorkflowNodeUIPlugin = createToolKindUIPlugin("get-db-info");
