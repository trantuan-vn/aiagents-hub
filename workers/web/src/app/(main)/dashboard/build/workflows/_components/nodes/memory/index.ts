import {
  MEMORY_KINDS,
  MEMORY_OVERRIDE_KINDS,
  isSimpleMemoryKind,
  memoryKindDescKey,
  memoryKindNameKey,
  simpleMemoryDefaultData,
  type MemoryKind,
} from "@aiagents-hub/workflow-nodes";

import type { WorkflowNodeUIPlugin } from "../types";
import { MemoryWorkflowNode } from "./canvas";
import { isVectorizeMemoryNode, VectorizeNodeConfigPanel } from "./config-panel";
import { isSimpleMemoryNode, SimpleMemoryNodeConfigPanel } from "./simple-config-panel";

export { MemoryWorkflowNode } from "./canvas";
export { isVectorizeMemoryNode, VectorizeNodeConfigPanel } from "./config-panel";
export { isSimpleMemoryNode, SimpleMemoryNodeConfigPanel } from "./simple-config-panel";

/** Base memory_node — hidden; kind plugins are catalog entries. */
export const memoryUIPlugin: WorkflowNodeUIPlugin = {
  id: "memory_node",
  runtimeType: "memory_node",
  Canvas: MemoryWorkflowNode,
  defaults: () => ({ label: "Memory", memoryKind: "vectorize" }),
  catalog: {
    category: "memory",
    labelKey: "node_memory",
    descriptionKey: "node_memory_desc",
    icon: "Database",
    visible: false,
  },
};

export function createMemoryKindUIPlugin(kind: MemoryKind): WorkflowNodeUIPlugin {
  return {
    id: `memory_node:${kind}`,
    runtimeType: "memory_node",
    kind,
    Canvas: MemoryWorkflowNode,
    defaults: () => ({
      label: kind.replace(/_/g, " "),
      memoryKind: kind,
      catalogId: kind,
    }),
    catalog: {
      category: "memory",
      labelKey: memoryKindNameKey(kind),
      descriptionKey: memoryKindDescKey(kind),
      icon: "Database",
      keywords: [kind, "memory"],
    },
  };
}

export const MEMORY_KIND_UI_PLUGINS: WorkflowNodeUIPlugin[] = MEMORY_KINDS.filter(
  (kind) => !MEMORY_OVERRIDE_KINDS.has(kind),
).map(createMemoryKindUIPlugin);

/** Override — windowed chat memory with n8n-style session config. */
export const memorySimpleUIPlugin: WorkflowNodeUIPlugin = {
  ...createMemoryKindUIPlugin("simple"),
  ConfigPanel: SimpleMemoryNodeConfigPanel,
  defaults: () => simpleMemoryDefaultData(),
  match: (node) => isSimpleMemoryNode(node),
};

/** Override — vectorize with custom config panel. */
export const memoryVectorizeUIPlugin: WorkflowNodeUIPlugin = {
  ...createMemoryKindUIPlugin("vectorize"),
  ConfigPanel: VectorizeNodeConfigPanel,
  defaults: () => ({
    label: "Vectorize",
    memoryKind: "vectorize",
    catalogId: "vectorize",
    collection: "VECTORIZE",
    dimensions: 768,
    metric: "cosine",
  }),
  match: (node) => isVectorizeMemoryNode(node) && !isSimpleMemoryKind((node.data as { memoryKind?: string })?.memoryKind),
};
