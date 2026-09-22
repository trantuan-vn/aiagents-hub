export type DbColumnInfo = {
  name: string;
  type: string;
  nullable: boolean;
  default?: string;
  comment?: string;
};

export type DbForeignKey = {
  column: string;
  refTable: string;
  refColumn: string;
};

export type SqlHistoryEntry = {
  sql: string;
  executedAt?: string;
  durationMs?: number;
  rowCount?: number;
};

export type GetDbInfoInput = {
  tableName?: string;
  schemaName?: string;
  sampleRowLimit?: number;
  sqlHistoryLimit?: number;
  includeSqlHistory?: boolean;
};

export type GetDbInfoResult = {
  dbId: string;
  schemaName: string;
  tableName: string;
  columns: DbColumnInfo[];
  primaryKey: string[];
  foreignKeys: DbForeignKey[];
  ddl: string;
  sampleRows: Record<string, unknown>[];
  sqlHistory: SqlHistoryEntry[];
  rowCountEstimate?: number;
};

export type DbConnection = {
  type: string;
  credentialKey?: string;
  databaseId?: string;
  user?: string;
  password?: string;
  connectString?: string;
};
