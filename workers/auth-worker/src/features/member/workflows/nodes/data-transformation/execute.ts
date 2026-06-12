import type { NodeContext, NodeOutput } from '../types.js';

export async function executeDataTransformation(ctx: NodeContext): Promise<NodeOutput> {
  const data = (ctx.node.data ?? {}) as Record<string, unknown>;
  const mode = String(data.mode ?? 'pick_text');
  if (mode === 'json_parse' && typeof ctx.nodeInput.text === 'string') {
    try {
      return { data: JSON.parse(ctx.nodeInput.text) };
    } catch {
      return { data: ctx.nodeInput.text };
    }
  }
  return { text: ctx.nodeInput.text ?? JSON.stringify(ctx.nodeInput), data: ctx.nodeInput };
}
