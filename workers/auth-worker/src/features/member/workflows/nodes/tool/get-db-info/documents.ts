import type { GetDbInfoResult } from './execute.js';

export type RagDocumentItem = {
  content: string;
  documentId: string;
  source: string;
  metadata: Record<string, string>;
};

function qualifiedTable(info: GetDbInfoResult): string {
  return info.schemaName ? `${info.schemaName}.${info.tableName}` : info.tableName;
}

function yamlHeader(info: GetDbInfoResult, docType: 'schema' | 'sqlexample'): string {
  return [
    '---',
    `docType: ${docType}`,
    `dbId: ${info.dbId || 'default'}`,
    `schemaName: ${info.schemaName}`,
    `tableName: ${info.tableName}`,
    `generatedAt: ${new Date().toISOString()}`,
    '---',
    '',
  ].join('\n');
}

export function buildSchemaDocument(info: GetDbInfoResult): RagDocumentItem {
  const table = qualifiedTable(info);
  const columns = info.columns
    .map(
      (c) =>
        `| ${c.name} | ${c.type} | ${c.nullable ? 'YES' : 'NO'} | ${c.default ?? ''} | ${c.comment ?? ''} |`,
    )
    .join('\n');
  const fks = info.foreignKeys.length
    ? info.foreignKeys.map((fk) => `- \`${fk.column}\` → \`${fk.refTable}(${fk.refColumn})\``).join('\n')
    : '- none';
  const sample =
    info.sampleRows.length > 0
      ? '```json\n' + JSON.stringify(info.sampleRows.slice(0, 3), null, 2) + '\n```'
      : '_No sample rows._';

  const content = `${yamlHeader(info, 'schema')}# Table: ${table}

## DDL
\`\`\`sql
${info.ddl}
\`\`\`

## Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
${columns || '| — | — | — | — | — |'}

## Primary key
${info.primaryKey.length ? info.primaryKey.map((k) => `- \`${k}\``).join('\n') : '- none'}

## Foreign keys
${fks}

## Sample shape (from live data)
${sample}
`;

  const documentId = `${info.dbId || 'db'}.${info.schemaName}.${info.tableName}.schema`;
  return {
    content,
    documentId,
    source: `${table}.schema.md`,
    metadata: {
      docType: 'schema',
      tableName: info.tableName,
      schemaName: info.schemaName,
      dbId: info.dbId || '',
    },
  };
}

function suggestedSelects(info: GetDbInfoResult): string {
  const table = qualifiedTable(info);
  const cols = info.columns.map((c) => c.name);
  const pk = info.primaryKey[0] ?? cols[0] ?? 'id';
  const dateCol = cols.find((c) => /(_at|date|time)$/i.test(c));
  const lines = [
    `SELECT * FROM ${table} LIMIT 50;`,
    `SELECT COUNT(*) AS row_count FROM ${table};`,
  ];
  if (dateCol) {
    lines.push(`SELECT * FROM ${table} ORDER BY ${dateCol} DESC LIMIT 20;`);
  } else {
    lines.push(`SELECT * FROM ${table} ORDER BY ${pk} DESC LIMIT 20;`);
  }
  return lines.map((sql, i) => `### ${i + 1}\n\`\`\`sql\n${sql}\n\`\`\``).join('\n\n');
}

export function buildSqlExampleDocument(info: GetDbInfoResult): RagDocumentItem {
  const table = qualifiedTable(info);
  const history = info.sqlHistory.length
    ? info.sqlHistory
        .map((entry, i) => {
          const meta = [
            entry.executedAt ? `Executed: ${entry.executedAt}` : null,
            entry.rowCount != null ? `Rows: ${entry.rowCount}` : null,
          ]
            .filter(Boolean)
            .join(' · ');
          return `### ${i + 1}. Historical query\n\`\`\`sql\n${entry.sql}\n\`\`\`${meta ? `\n- ${meta}` : ''}`;
        })
        .join('\n\n')
    : '_No historical queries recorded._';

  const content = `${yamlHeader(info, 'sqlexample')}# SQL examples: ${table}

## Historical queries (from audit log)

${history}

## Suggested patterns

${suggestedSelects(info)}

## Anti-patterns / notes
- Always qualify the table as \`${table}\`
- Generate read-only SQL (SELECT) unless the user explicitly asks otherwise
`;

  const documentId = `${info.dbId || 'db'}.${info.schemaName}.${info.tableName}.sqlexample`;
  return {
    content,
    documentId,
    source: `${table}.sqlexample.md`,
    metadata: {
      docType: 'sqlexample',
      tableName: info.tableName,
      schemaName: info.schemaName,
      dbId: info.dbId || '',
    },
  };
}

export function ragDocumentsFromDbInfo(info: GetDbInfoResult): RagDocumentItem[] {
  return [buildSchemaDocument(info), buildSqlExampleDocument(info)];
}
