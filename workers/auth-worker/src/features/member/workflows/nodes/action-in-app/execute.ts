import type { NodeContext, NodeOutput } from '../types.js';

export async function executeActionInApp(ctx: NodeContext): Promise<NodeOutput> {
  const data = (ctx.node.data ?? {}) as Record<string, unknown>;
  return {
    ...ctx.nodeInput,
    action: String(data.actionId ?? data.action ?? 'noop'),
    integrationId: data.integrationId,
    result: `Action "${data.actionId ?? data.action ?? 'noop'}" recorded (extensible)`,
  };
}
