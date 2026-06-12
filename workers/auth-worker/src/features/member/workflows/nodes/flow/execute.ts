import { activeHandlesForNode } from '../../engine/flow-helpers.js';
import { gatherMainFlowInputs } from '../../engine/graph-helpers.js';
import type { NodeContext, NodeOutput } from '../types.js';

export async function executeFlow(ctx: NodeContext): Promise<NodeOutput> {
  const data = (ctx.node.data ?? {}) as Record<string, unknown>;
  const scope: Record<string, unknown> = {
    ...ctx.nodeInput,
    input: ctx.input ?? '',
    variables: ctx.runContext.variables ?? {},
  };
  const flowKind = String(data.flowKind ?? 'if');

  if (flowKind === 'merge') {
    const merged = gatherMainFlowInputs(ctx.node.id, ctx.definition.edges, ctx.outputs);
    return { ...merged, merged: true, flowKind: 'merge' };
  }

  const branches = activeHandlesForNode(ctx.node, ctx.nodeInput, scope);
  const conditionResult = flowKind === 'if' ? branches.has('true') : undefined;
  return {
    ...ctx.nodeInput,
    flowKind,
    conditionResult,
    activeBranches: [...branches],
    filtered: flowKind === 'filter' ? branches.has('out') : undefined,
  };
}
