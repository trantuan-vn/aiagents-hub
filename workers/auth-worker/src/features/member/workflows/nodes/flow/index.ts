import {
  FLOW_KINDS,
  FLOW_OVERRIDE_KINDS,
  type FlowKind,
} from '@aiagents-hub/workflow-nodes';

import type { WorkflowNodePlugin } from '../types.js';
import { LOOP_OVER_ITEMS_PERSIST_SHAPE } from '../../engine/persist-shapes.js';
import { executeFlow } from './execute.js';

export { executeFlow } from './execute.js';

/** Base flow — fallback when no flowKind is set. */
export const flowPlugin: WorkflowNodePlugin = {
  id: 'flow',
  runtimeType: 'flow',
  execute: executeFlow,
};

export function createFlowKindPlugin(kind: FlowKind): WorkflowNodePlugin {
  return {
    id: `flow:${kind}`,
    runtimeType: 'flow',
    kind,
    execute: executeFlow,
    ...(kind === 'loop_over_items' ? LOOP_OVER_ITEMS_PERSIST_SHAPE : {}),
  };
}

/** Override kinds still resolve via base execute until dedicated modules exist. */
export const FLOW_KIND_PLUGINS: WorkflowNodePlugin[] = FLOW_KINDS.filter(
  (kind) => !FLOW_OVERRIDE_KINDS.has(kind),
).map(createFlowKindPlugin);

/** Dedicated loop_over_items plugin (override slot — shares execute for now). */
export const flowLoopOverItemsPlugin: WorkflowNodePlugin = {
  id: 'flow:loop_over_items',
  runtimeType: 'flow',
  kind: 'loop_over_items',
  execute: executeFlow,
  ...LOOP_OVER_ITEMS_PERSIST_SHAPE,
};

/** Dedicated filter plugin (override slot — shares execute). */
export const flowFilterPlugin: WorkflowNodePlugin = {
  id: 'flow:filter',
  runtimeType: 'flow',
  kind: 'filter',
  execute: executeFlow,
};
