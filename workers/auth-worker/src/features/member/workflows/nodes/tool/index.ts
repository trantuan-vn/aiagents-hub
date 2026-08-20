import {
  TOOL_KINDS,
  TOOL_OVERRIDE_KINDS,
  type ToolKind,
} from '@aiagents-hub/workflow-nodes';

import { executeToolNode } from './execute.js';
import type { WorkflowNodePlugin } from '../types.js';

export { executeSaveRag, executeSaveRagPipeline } from './save-rag/execute.js';
export type {
  SaveRagChunkInput,
  SaveRagInput,
  SaveRagResult,
  SaveRagExecuteParams,
} from './save-rag/execute.js';

export { executeGetRag, executeGetRagPipeline } from './get-rag/execute.js';
export type {
  GetRagInput,
  GetRagSnippet,
  GetRagResult,
  GetRagExecuteParams,
} from './get-rag/execute.js';

export { executeGetDbInfo, executeGetDbInfoPipeline, listDatabaseTables, introspectTableToRagDocuments } from './get-db-info/execute.js';
export type {
  DbColumnInfo,
  DbForeignKey,
  SqlHistoryEntry,
  GetDbInfoInput,
  GetDbInfoResult,
  GetDbInfoExecuteParams,
} from './get-db-info/execute.js';

export { chunkText } from './save-rag/chunk.js';
export type { TextChunk } from './save-rag/chunk.js';

export {
  extractTextFromPdfFiles,
  filesFromWebhookBody,
} from './save-rag/pdf-extract.js';
export type { PdfFileInput } from './save-rag/pdf-extract.js';

export { resolveRagResources, toolNodeConfig } from './shared/rag-context.js';
export type { RagResourceContext } from './shared/rag-context.js';

export { executeToolNode } from './execute.js';

/** Base tool_node — agent-only tools skip graph execute; RAG kinds run via executeToolNode. */
export const toolNodePlugin: WorkflowNodePlugin = {
  id: 'tool_node',
  runtimeType: 'tool_node',
  skipExecution: true,
};

export function createToolKindPlugin(kind: ToolKind): WorkflowNodePlugin {
  return {
    id: `tool_node:${kind}`,
    runtimeType: 'tool_node',
    kind,
    skipExecution: true,
  };
}

export const TOOL_KIND_PLUGINS: WorkflowNodePlugin[] = TOOL_KINDS.filter(
  (kind) => !TOOL_OVERRIDE_KINDS.has(kind),
).map(createToolKindPlugin);

/** Override slots — dedicated execute modules. Skip only when used as Agent tools (no data-flow). */
export const toolSaveRagPlugin: WorkflowNodePlugin = {
  id: 'tool_node:save-rag',
  runtimeType: 'tool_node',
  kind: 'save-rag',
  execute: executeToolNode,
};

export const toolGetRagPlugin: WorkflowNodePlugin = {
  id: 'tool_node:get-rag',
  runtimeType: 'tool_node',
  kind: 'get-rag',
  execute: executeToolNode,
};

export const toolGetDbInfoPlugin: WorkflowNodePlugin = {
  id: 'tool_node:get-db-info',
  runtimeType: 'tool_node',
  kind: 'get-db-info',
  execute: executeToolNode,
};
