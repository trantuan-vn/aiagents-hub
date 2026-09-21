import { evaluateFilterFromNodeData } from '@aiagents-hub/workflow-nodes';

import type { NodeContext, NodeOutput } from '../types.js';

export async function executeDataTransformation(ctx: NodeContext): Promise<NodeOutput> {
  const data = (ctx.node.data ?? {}) as Record<string, unknown>;
  if (String(data.transformKind ?? '') === 'filter') {
    const scope: Record<string, unknown> = {
      ...ctx.nodeInput,
      input: ctx.input ?? '',
      variables: ctx.runContext.variables ?? {},
    };
    const pass = evaluateFilterFromNodeData(data, scope);
    if (pass === false) return { filtered: false };
    return { ...ctx.nodeInput, filtered: pass !== false };
  }
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
