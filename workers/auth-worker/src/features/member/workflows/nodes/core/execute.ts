import type { NodeContext, NodeOutput } from '../types.js';

export async function executeCore(ctx: NodeContext): Promise<NodeOutput> {
  const data = (ctx.node.data ?? {}) as Record<string, unknown>;
  const op = String(data.operation ?? 'identity');
  if (op === 'set_variable' && data.key) {
    ctx.runContext.variables = {
      ...(ctx.runContext.variables as Record<string, unknown>),
      [String(data.key)]: data.value,
    };
  }
  return { ...ctx.nodeInput, variables: ctx.runContext.variables };
}
