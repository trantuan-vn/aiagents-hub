import { activeHandlesForNode } from '../../engine/flow-helpers.js';
import { gatherMainFlowInputs } from '../../engine/graph-helpers.js';
import {
  executeLoopOverItems,
  isLoopOverItemsNode,
} from '../../engine/loop-helpers.js';
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

  if (isLoopOverItemsNode(ctx.node)) {
    const loopCtx = ctx.runContext._loop as
      | { nodeId: string; isReturn?: boolean; returnOutput?: NodeOutput }
      | undefined;
    const isReturn = loopCtx?.nodeId === ctx.node.id && loopCtx.isReturn === true;
    const existingState = (ctx.runContext._loopStates as Record<string, import('../../engine/loop-helpers.js').LoopState> | undefined)?.[ctx.node.id];
    const result = executeLoopOverItems(
      data,
      ctx.nodeInput,
      existingState,
      isReturn,
      isReturn ? loopCtx?.returnOutput : undefined,
    );
    return {
      ...result.output,
      flowKind: 'loop_over_items',
      activeBranches: [...result.activeHandles],
      _loopState: result.loopState,
    };
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
