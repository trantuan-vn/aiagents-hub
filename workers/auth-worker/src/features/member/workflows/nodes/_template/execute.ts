import type { NodeContext, NodeOutput } from '../types.js';

export async function executeTemplate(ctx: NodeContext): Promise<NodeOutput> {
  return { ...ctx.nodeInput };
}
