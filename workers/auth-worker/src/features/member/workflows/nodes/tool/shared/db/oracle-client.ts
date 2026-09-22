export {
  fetchOracleSqlHistories as fetchSqlHistory,
  introspectOracleTable as introspectTable,
  introspectOracleTables as introspectTables,
  listOracleTables as listTables,
} from './oracle.js';

/** Phase 4 fills this. Check SQL is the only caller. */
export function executeReadOnly(): Promise<never> {
  return Promise.reject(new Error('executeReadOnly is not implemented'));
}
