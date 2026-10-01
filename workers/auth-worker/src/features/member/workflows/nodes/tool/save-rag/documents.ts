import type { GetDbInfoResult } from '../shared/db/types.js';
import { COLUMN_DESC_MAX, type TableEnrichment } from './describe-table.js';

export type RagDocumentItem = {
  content: string;
  documentId: string;
  source: string;
  metadata: Record<string, string>;
};

function qualifiedTable(info: GetDbInfoResult): string {
  return info.schemaName ? `${info.schemaName}.${info.tableName}` : info.tableName;
}

function escapeCell(value: string): string {
  return value.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
}

function sameName(a: string, b: string): boolean {
  return a.toUpperCase() === b.toUpperCase();
}

function columnDescription(
  col: GetDbInfoResult['columns'][number],
  enrichment: TableEnrichment | undefined,
): { vi: string; en: string; aliases: string[] } {
  const found = enrichment?.columns.find((c) => c.name === col.name);
  return {
    vi: found?.descriptionVi ?? '',
    en: found?.descriptionEn ?? '',
    aliases: found?.aliasesVi ?? [],
  };
}

function keyCell(name: string, info: GetDbInfoResult): string {
  const parts: string[] = [];
  if (info.primaryKey.some((key) => sameName(key, name))) parts.push('PK');
  for (const fk of info.foreignKeys) {
    if (!sameName(fk.column, name)) continue;
    const refTable = fk.refTable.trim();
    const refColumn = fk.refColumn.trim();
    if (refTable && refColumn) parts.push(`FK → ${refTable}.${refColumn}`);
  }
  return parts.join(', ');
}

function assertEnrichmentComplete(info: GetDbInfoResult, enrichment: TableEnrichment): void {
  const summaryVi = enrichment.tableSummaryVi.trim();
  const summaryEn = enrichment.tableSummaryEn.trim();
  if (!summaryVi || !summaryEn || summaryVi.length > COLUMN_DESC_MAX || summaryEn.length > COLUMN_DESC_MAX) {
    throw new Error(`save_rag: table ${info.tableName} summary incomplete`);
  }
  for (const col of info.columns) {
    const found = enrichment.columns.find((item) => item.name === col.name);
    const vi = found?.descriptionVi.trim() ?? '';
    const en = found?.descriptionEn.trim() ?? '';
    if (!vi || !en || vi.length > COLUMN_DESC_MAX || en.length > COLUMN_DESC_MAX) {
      throw new Error(`save_rag: column "${col.name}" enrichment incomplete`);
    }
  }
}

export function buildSchemaDocument(
  info: GetDbInfoResult,
  enrichment?: TableEnrichment,
): RagDocumentItem {
  const table = qualifiedTable(info);
  const summaryVi = enrichment?.tableSummaryVi?.trim() ?? '';
  const summaryEn = enrichment?.tableSummaryEn?.trim() ?? '';
  const rows = info.columns
    .map((col) => {
      const d = columnDescription(col, enrichment);
      const description = `VI: ${d.vi} EN: ${d.en}`;
      return `| ${escapeCell(col.name)} | ${escapeCell(col.type)} | ${col.nullable ? 'YES' : 'NO'} | ${escapeCell(keyCell(col.name, info))} | ${escapeCell(description)} | ${escapeCell(d.aliases.join(', '))} |`;
    })
    .join('\n');

  const content = `# ${table}

${summaryVi}
${summaryEn}

| Column | Type | Nullable | Key | Description | Aliases |
${rows}
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

/** Oracle structure only. Descriptions stay empty until enrichment. */
export function ragDocumentsFromTableInfo(info: GetDbInfoResult): RagDocumentItem[] {
  return [buildSchemaDocument(info)];
}

/** One shortened schema document after every column and both summaries are complete. */
export function ragDocumentsFromEnrichment(
  info: GetDbInfoResult,
  enrichment: TableEnrichment,
): RagDocumentItem[] {
  assertEnrichmentComplete(info, enrichment);
  return [buildSchemaDocument(info, enrichment)];
}
