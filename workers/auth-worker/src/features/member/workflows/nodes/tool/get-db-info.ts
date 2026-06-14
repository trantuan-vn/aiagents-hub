/** Re-export shim — implementation lives in ./get-db-info/execute.ts */
export {
  executeGetDbInfo,
  listDatabaseTables,
  type DbColumnInfo,
  type DbForeignKey,
  type SqlHistoryEntry,
  type GetDbInfoInput,
  type GetDbInfoResult,
  type GetDbInfoExecuteParams,
} from './get-db-info/execute.js';
