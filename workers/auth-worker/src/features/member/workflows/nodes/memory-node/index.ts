import {
  MEMORY_KINDS,
  MEMORY_OVERRIDE_KINDS,
  type MemoryKind,
} from '@aiagents-hub/workflow-nodes';

import type { WorkflowNodePlugin } from '../types.js';

/** Base memory_node — attached to agents; not executed on the main path. */
export const memoryNodePlugin: WorkflowNodePlugin = {
  id: 'memory_node',
  runtimeType: 'memory_node',
  skipExecution: true,
};

export function createMemoryKindPlugin(kind: MemoryKind): WorkflowNodePlugin {
  return {
    id: `memory_node:${kind}`,
    runtimeType: 'memory_node',
    kind,
    skipExecution: true,
  };
}

export const MEMORY_KIND_PLUGINS: WorkflowNodePlugin[] = MEMORY_KINDS.filter(
  (kind) => !MEMORY_OVERRIDE_KINDS.has(kind),
).map(createMemoryKindPlugin);

/** Override — vectorize memory (custom FE config panel). */
export const memoryVectorizePlugin: WorkflowNodePlugin = {
  id: 'memory_node:vectorize',
  runtimeType: 'memory_node',
  kind: 'vectorize',
  skipExecution: true,
};
