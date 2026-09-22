import type { NodeContext, NodeOutput } from '../types.js';
import { getToolModule } from './shared/registry.js';

/** Execute a tool_node on the data-flow path via ToolModule registry. */
export async function executeToolNode(ctx: NodeContext): Promise<NodeOutput> {
  const kind = String((ctx.node.data as Record<string, unknown> | undefined)?.toolKind ?? '');
  const mod = getToolModule(kind);
  if (mod?.executePipeline) return mod.executePipeline(ctx);
  return { ...ctx.nodeInput, skipped: true, reason: `toolKind "${kind}" has no pipeline execute` };
}
