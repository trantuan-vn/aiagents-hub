import { applyStructuredFilter, evaluateFilterFromNodeData } from '@aiagents-hub/workflow-nodes';

import type { NodeContext, NodeOutput } from '../types.js';
import { runCodeTransform } from './code-runtime.js';

export async function executeDataTransformation(ctx: NodeContext): Promise<NodeOutput> {
  const data = (ctx.node.data ?? {}) as Record<string, unknown>;
  if (String(data.transformKind ?? '') === 'code') {
    try {
      return await runCodeTransform({
        env: ctx.c.env as { LOADER?: WorkerLoader },
        data,
        nodeInput: ctx.nodeInput ?? {},
      });
    } catch (error) {
      if (data.continueOnFail === true) {
        const message = error instanceof Error ? error.message : String(error);
        return { error: message, items: [], data: null, json: {}, itemCount: 0, text: '' };
      }
      throw error;
    }
  }
  if (String(data.transformKind ?? '') === 'filter') {
    const scope: Record<string, unknown> = {
      ...ctx.nodeInput,
      input: ctx.input ?? '',
      variables: ctx.runContext.variables ?? {},
    };
    const applied = applyStructuredFilter(data, ctx.nodeInput, scope);
    if (applied) {
      return { ...applied.output, filtered: applied.pass };
    }
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
