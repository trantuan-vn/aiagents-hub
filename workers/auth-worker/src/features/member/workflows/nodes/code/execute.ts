import { runCodeNode } from '../../node-runtime.js';
import type { NodeContext, NodeOutput } from '../types.js';

export async function executeCode(ctx: NodeContext): Promise<NodeOutput> {
  const data = (ctx.node.data ?? {}) as Record<string, unknown>;
  const scope: Record<string, unknown> = {
    ...ctx.nodeInput,
    input: ctx.input ?? '',
    variables: ctx.runContext.variables ?? {},
  };
  const codeData = {
    ...data,
    template: data.template ?? data.code ?? data.expression ?? '',
  };
  return { ...runCodeNode(codeData, scope) };
}
