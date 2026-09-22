import {
  GET_DB_INFO_CONNECT_STRING_FIELD,
  GET_DB_INFO_PASSWORD_FIELD,
  GET_DB_INFO_USER_FIELD,
} from '@aiagents-hub/workflow-nodes';
import type { NodeContext, NodeOutput } from '../../types.js';
import {
  filterTables,
  listDatabaseTables,
  resolveOracleConnectConfig,
  resolveOracleSchema,
  type DbConnection,
  type OracleConnectConfig,
} from '../shared/db/index.js';
import { pipelineItems, resolvePipelineField } from '../shared/pipeline.js';

export type { DbColumnInfo, DbForeignKey, GetDbInfoInput, GetDbInfoResult, SqlHistoryEntry } from '../shared/db/index.js';
export { listDatabaseTables } from '../shared/db/index.js';

export type GetDbInfoListResult = {
  ok: true;
  schemaName: string;
  tables: string[];
  count: number;
  connection?: Record<string, unknown>;
};

export type GetDbInfoExecuteParams = {
  env: Env;
  definition: import('../../../domain/domain.js').WorkflowDefinition;
  agentId: string;
  triggerContext: Record<string, unknown>;
  input: { schemaName?: string; tableFilter?: string };
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function oracleConfigFrom(source: Record<string, unknown>, connection?: DbConnection): OracleConnectConfig | null {
  return resolveOracleConnectConfig({
    ...source,
    ...(connection ?? {}),
    connection: connection ?? source.connection,
  });
}

function mappedFormFields(nodeInput: NodeOutput, data: Record<string, unknown>): Record<string, unknown> {
  const item = pipelineItems(nodeInput)[0] ?? asRecord(nodeInput);
  const mapped: Record<string, unknown> = {};
  const user = resolvePipelineField(data.userField || GET_DB_INFO_USER_FIELD, item, nodeInput, []);
  const password = resolvePipelineField(data.passwordField || GET_DB_INFO_PASSWORD_FIELD, item, nodeInput, []);
  const connectString = resolvePipelineField(
    data.connectStringField || GET_DB_INFO_CONNECT_STRING_FIELD,
    item,
    nodeInput,
    [],
  );
  const schemaName = resolvePipelineField(data.schemaNameField, item, nodeInput, []);
  const tableName = resolvePipelineField(data.tableNameField, item, nodeInput, []);
  if (user) {
    mapped.user = user;
    mapped.u = user;
  }
  if (password) {
    mapped.password = password;
    mapped.p = password;
  }
  if (connectString) {
    mapped.connectString = connectString;
    mapped.c = connectString;
  }
  if (schemaName) mapped.schemaName = schemaName;
  if (tableName) mapped.tableName = tableName;
  return mapped;
}

function triggerContextFromNodeInput(nodeInput: NodeOutput, data: Record<string, unknown>): Record<string, unknown> {
  const mapped = mappedFormFields(nodeInput, data);
  const input = asRecord(nodeInput);
  const incomingConnection = asRecord(input.connection);
  const oracleConfig = resolveOracleConnectConfig(mapped) ?? resolveOracleConnectConfig(input);
  const explicitType = String(incomingConnection.type ?? input.connectionType ?? '')
    .trim()
    .toLowerCase();
  const connectionType = oracleConfig ? 'oracle' : explicitType === 'd1' ? 'd1' : '';
  return {
    ...mapped,
    dbId: String(mapped.dbId ?? input.dbId ?? ''),
    databaseId: String(mapped.databaseId ?? input.databaseId ?? ''),
    schemaName: String(mapped.schemaName ?? input.schemaName ?? ''),
    tableName: String(mapped.tableName ?? input.tableName ?? ''),
    tableFilter: String(mapped.tableFilter ?? input.tableFilter ?? data.tableFilter ?? '*'),
    connectionType,
    connection: {
      ...(incomingConnection ?? {}),
      ...(oracleConfig
        ? { type: 'oracle', ...oracleConfig }
        : connectionType
          ? { type: connectionType }
          : {}),
    },
  };
}

export type TableLoopItem = {
  tableName: string;
  schemaName: string;
};

function buildTableLoopItem(tableName: string, schemaName: string): TableLoopItem {
  return { tableName, schemaName };
}

/** Agent / programmatic: list table names only. */
export async function executeGetDbInfo(params: GetDbInfoExecuteParams): Promise<GetDbInfoListResult> {
  const { env, triggerContext, input } = params;
  const connection = (triggerContext.connection ?? {}) as DbConnection;
  const oracleConfig = oracleConfigFrom(triggerContext, connection);
  const requestedSchema = input.schemaName ?? String(triggerContext.schemaName ?? 'public');
  const schemaName = oracleConfig
    ? resolveOracleSchema(requestedSchema, oracleConfig.user)
    : requestedSchema;
  const tableFilter = String(input.tableFilter ?? triggerContext.tableFilter ?? '*');
  const namedTable = String(triggerContext.tableName ?? '').trim();

  const tables = namedTable
    ? filterTables([namedTable], tableFilter)
    : await listDatabaseTables(env, connection, schemaName, tableFilter);

  return {
    ok: true,
    schemaName,
    tables,
    count: tables.length,
    ...(oracleConfig
      ? { connection: { type: 'oracle', ...oracleConfig, ...asRecord(connection) } }
      : Object.keys(asRecord(connection)).length
        ? { connection: asRecord(connection) }
        : {}),
  };
}

/** Graph-path: list tables → loop items carry connection for Save RAG. */
export async function executeGetDbInfoPipeline(ctx: NodeContext): Promise<NodeOutput> {
  const data = (ctx.node.data ?? {}) as Record<string, unknown>;
  const triggerContext = triggerContextFromNodeInput(ctx.nodeInput, data);
  const connection = asRecord(triggerContext.connection) as DbConnection;
  const oracleConfig = oracleConfigFrom(triggerContext, connection);
  const schemaName = oracleConfig
    ? resolveOracleSchema(String(triggerContext.schemaName ?? ''), oracleConfig.user)
    : String(triggerContext.schemaName ?? 'public');
  const tableFilter = String(triggerContext.tableFilter ?? '*');
  const namedTable = String(triggerContext.tableName ?? '').trim();

  const tables = namedTable
    ? filterTables([namedTable], tableFilter)
    : await listDatabaseTables(ctx.c.env, connection, schemaName, tableFilter);

  if (!tables.length) {
    throw new Error(
      oracleConfig
        ? `get_db_info: no tables found in Oracle schema ${schemaName} (set tableName on the form, or check the user can see ALL_TABLES)`
        : 'get_db_info: Oracle user, password, and connectString are required from the previous node (map u / p / c). Will not list the platform database.',
    );
  }

  const maxTables = 25;
  const selected = tables.slice(0, maxTables);
  const items = selected.map((tableName) => buildTableLoopItem(tableName, schemaName));

  const connectionOut = oracleConfig
    ? { type: 'oracle' as const, ...oracleConfig, ...asRecord(connection) }
    : asRecord(triggerContext.connection);

  return {
    dbId: String(triggerContext.dbId ?? ''),
    schemaName,
    tables: selected,
    items,
    count: items.length,
    tableCount: selected.length,
    connection: connectionOut,
    ...(oracleConfig
      ? {
          user: oracleConfig.user,
          password: oracleConfig.password,
          connectString: oracleConfig.connectString,
          connectionType: 'oracle',
        }
      : {}),
  };
}
