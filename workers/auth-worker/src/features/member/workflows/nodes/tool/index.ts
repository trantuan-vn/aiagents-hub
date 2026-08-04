import {
  TOOL_KINDS,
  TOOL_OVERRIDE_KINDS,
  type ToolKind,
} from '@aiagents-hub/workflow-nodes';

import type { WorkflowNodePlugin } from '../types.js';

export { executeSaveRag } from './save-rag/execute.js';
export type {
  SaveRagChunkInput,
  SaveRagInput,
  SaveRagResult,
  SaveRagExecuteParams,
} from './save-rag/execute.js';

export { executeGetRag } from './get-rag/execute.js';
export type {
  GetRagInput,
  GetRagSnippet,
  GetRagResult,
  GetRagExecuteParams,
} from './get-rag/execute.js';

export { executeGetDbInfo, listDatabaseTables } from './get-db-info/execute.js';
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

/** Base tool_node — agent tools run via agent runtime, not graph execute. */
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

/** Override slots — dedicated execute modules (still skip on main path; agent runtime calls execute*). */
export const toolSaveRagPlugin: WorkflowNodePlugin = {
  id: 'tool_node:save-rag',
  runtimeType: 'tool_node',
  kind: 'save-rag',
  skipExecution: true,
};

export const toolGetRagPlugin: WorkflowNodePlugin = {
  id: 'tool_node:get-rag',
  runtimeType: 'tool_node',
  kind: 'get-rag',
  skipExecution: true,
};

export const toolGetDbInfoPlugin: WorkflowNodePlugin = {
  id: 'tool_node:get-db-info',
  runtimeType: 'tool_node',
  kind: 'get-db-info',
  skipExecution: true,
};
