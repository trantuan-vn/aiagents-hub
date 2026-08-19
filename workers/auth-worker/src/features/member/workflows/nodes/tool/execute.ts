import type { NodeContext, NodeOutput } from '../types.js';
import { executeGetDbInfoPipeline } from './get-db-info/execute.js';
import { executeGetRagPipeline } from './get-rag/execute.js';
import { executeSaveRagPipeline } from './save-rag/execute.js';

/** Execute a RAG tool_node on the main data-flow path (Form → Get DB Info → Loop → Save RAG). */
export async function executeToolNode(ctx: NodeContext): Promise<NodeOutput> {
  const kind = String((ctx.node.data as Record<string, unknown> | undefined)?.toolKind ?? '');
  if (kind === 'get-db-info') return executeGetDbInfoPipeline(ctx);
  if (kind === 'save-rag') return executeSaveRagPipeline(ctx);
  if (kind === 'get-rag') return executeGetRagPipeline(ctx);
  return { ...ctx.nodeInput, skipped: true, reason: `toolKind "${kind}" has no pipeline execute` };
}
