/** Re-export shim — implementation lives in ./get-db-info/execute.ts */
export {
  executeGetDbInfo,
  executeGetDbInfoPipeline,
  listDatabaseTables,
  introspectTableToRagDocuments,
  type DbColumnInfo,
  type DbForeignKey,
  type SqlHistoryEntry,
  type GetDbInfoInput,
  type GetDbInfoResult,
  type GetDbInfoExecuteParams,
} from './get-db-info/execute.js';
