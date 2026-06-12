import type { NodeContext, NodeOutput } from '../types.js';

export async function executeTrigger(ctx: NodeContext): Promise<NodeOutput> {
  return {
    ...ctx.runContext,
    triggeredAt: Date.now(),
    text: ctx.input ?? '',
    data: ctx.nodeInput.data,
  };
}
