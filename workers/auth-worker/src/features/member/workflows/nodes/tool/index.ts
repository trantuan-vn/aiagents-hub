/** Public entry points for agent tool_node runtimes. */

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

/** Tool resource node on the canvas — agent tools run via agent runtime, not graph execute. */
export const toolNodePlugin: WorkflowNodePlugin = {
  id: 'tool_node',
  runtimeType: 'tool_node',
  skipExecution: true,
};
