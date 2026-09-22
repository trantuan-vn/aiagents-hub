import type { GetDbInfoResult, SqlHistoryEntry } from '../shared/db/types.js';
import type { TableEnrichment, TypicalQuery } from './describe-table.js';

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

function columnDescription(
  col: GetDbInfoResult['columns'][number],
  enrichment: TableEnrichment | undefined,
): { vi: string; en: string; aliases: string[] } {
  const found = enrichment?.columns.find((c) => c.name === col.name);
  const en = found?.descriptionEn || col.comment || '';
  const vi = found?.descriptionVi || '';
  return { vi, en, aliases: found?.aliasesVi ?? [] };
}

export function buildSchemaDocument(
  info: GetDbInfoResult,
  enrichment?: TableEnrichment,
): RagDocumentItem {
  const table = qualifiedTable(info);
  const summaryVi = enrichment?.tableSummaryVi?.trim();
  const summaryEn = enrichment?.tableSummaryEn?.trim();
  const summaryBlock =
    summaryVi || summaryEn
      ? `## Summary
${summaryVi ? `- VI: ${summaryVi}` : ''}
${summaryEn ? `- EN: ${summaryEn}` : ''}
`
      : '';

  const columns = info.columns
    .map((c) => {
      const d = columnDescription(c, enrichment);
      const alias =
        d.aliases.length > 0 ? ` aliasesVi=[${d.aliases.map((a) => `"${a}"`).join(', ')}]` : '';
      return `| ${c.name} | ${c.type} | ${c.nullable ? 'YES' : 'NO'} | ${c.default ?? ''} | ${d.vi} | ${d.en}${alias} |`;
    })
    .join('\n');
  const fks = info.foreignKeys.length
    ? info.foreignKeys.map((fk) => `- \`${fk.column}\` → \`${fk.refTable}(${fk.refColumn})\``).join('\n')
    : '- none';
  const sample =
    info.sampleRows.length > 0
      ? '```json\n' + JSON.stringify(info.sampleRows.slice(0, 3), null, 2) + '\n```'
      : '_No sample rows._';

  const content = `${yamlHeader(info, 'schema')}# Table: ${table}

${summaryBlock}## DDL
\`\`\`sql
${info.ddl}
\`\`\`

## Columns

| Column | Type | Nullable | Default | Description (VI) | Description (EN) |
|--------|------|----------|---------|------------------|------------------|
${columns || '| — | — | — | — | — | — |'}

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

function renderHistory(history: SqlHistoryEntry[]): string {
  if (!history.length) return '_No historical queries recorded._';
  return history
    .map((entry, i) => {
      const meta = [
        entry.executedAt ? `Executed: ${entry.executedAt}` : null,
        entry.rowCount != null ? `Rows: ${entry.rowCount}` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      return `### ${i + 1}. Historical query\n\`\`\`sql\n${entry.sql}\n\`\`\`${meta ? `\n- ${meta}` : ''}`;
    })
    .join('\n\n');
}

function renderTypical(queries: TypicalQuery[]): string {
  if (!queries.length) return '_No typical queries generated._';
  return queries
    .map((q, i) => {
      const title = q.titleVi || q.titleEn || `Query ${i + 1}`;
      const note = q.noteVi ? `\n- ${q.noteVi}` : '';
      return `### ${i + 1}. ${title}\n\`\`\`sql\n${q.sql}\n\`\`\`${note}`;
    })
    .join('\n\n');
}

export function buildSqlExampleDocument(
  info: GetDbInfoResult,
  enrichment?: TableEnrichment,
): RagDocumentItem | null {
  const history = info.sqlHistory ?? [];
  const typical = enrichment?.typicalQueries ?? [];
  if (!history.length && !typical.length) return null;

  const table = qualifiedTable(info);
  const content = `${yamlHeader(info, 'sqlexample')}# SQL examples: ${table}

## Historical queries (from ADMIN.DBTOOLS$EXECUTION_HISTORY)

${renderHistory(history)}

## Typical queries

${renderTypical(typical)}

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

/** Build schema (+ optional sqlexample) after LLM enrichment. */
export function ragDocumentsFromEnrichment(
  info: GetDbInfoResult,
  enrichment?: TableEnrichment,
): RagDocumentItem[] {
  const docs = [buildSchemaDocument(info, enrichment)];
  const sqlDoc = buildSqlExampleDocument(info, enrichment);
  if (sqlDoc) docs.push(sqlDoc);
  return docs;
}
