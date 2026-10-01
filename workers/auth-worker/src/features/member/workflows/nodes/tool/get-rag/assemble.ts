import { matchToSnippet, vectorChunkId, type VectorMatch } from '../../../rag/index.js';

const MIN_OVERLAP = 8;

export { vectorChunkId };

/** Phase 3: schema before SQL examples for the Reasoning Agent. */
const DOC_TYPE_ORDER: Record<string, number> = {
  schema: 0,
  sqlexample: 1,
};

export function metadataValue(match: VectorMatch, key: string): string {
  if (!key) return '';
  return String(match.metadata?.[key] ?? '').trim();
}

/** Metadata key used to group related docs. Configured by the user; empty = infer from stored metadata. */
export function inferGroupBy(matches: VectorMatch[], configured: string): string {
  const key = configured.trim();
  if (key) return key;
  if (matches.some((match) => metadataValue(match, 'tableName'))) return 'tableName';
  if (matches.some((match) => metadataValue(match, 'documentId'))) return 'documentId';
  if (matches.some((match) => metadataValue(match, 'source'))) return 'source';
  return '';
}

export function resolveGroupKey(match: VectorMatch, groupBy: string): string {
  if (groupBy) {
    const grouped = metadataValue(match, groupBy);
    if (grouped) return grouped;
  }
  const documentId = metadataValue(match, 'documentId');
  if (documentId) return documentId.replace(/::c(?:hunk-)?\d+$/i, '');
  const source = metadataValue(match, 'source');
  if (source) return source;
  return String(match.id ?? matchToSnippet(match).slice(0, 40));
}

export function overlapJoin(left: string, right: string): string {
  if (!left) return right;
  if (!right) return left;
  const max = Math.min(left.length, right.length);
  for (let n = max; n >= MIN_OVERLAP; n--) {
    if (left.slice(-n) === right.slice(0, n)) return left + right.slice(n);
  }
  if (left.endsWith(right)) return left;
  return `${left}\n${right}`;
}

export function stitchChunkTexts(chunks: Array<{ index: number; text: string }>): string {
  const sorted = [...chunks].sort((a, b) => a.index - b.index || a.text.localeCompare(b.text));
  return sorted.reduce((acc, chunk, i) => (i === 0 ? chunk.text : overlapJoin(acc, chunk.text)), '');
}

/** formatVersion 2: exact slices, no inserted newline. */
export function stitchExact(chunks: Array<{ index: number; text: string }>): string {
  return [...chunks].sort((a, b) => a.index - b.index).map((chunk) => chunk.text).join('');
}

function isFormatV2(match: VectorMatch): boolean {
  return String(match.metadata?.formatVersion ?? '') === '2';
}

function strictChunkIndex(match: VectorMatch): number | null {
  const raw = match.metadata?.chunkIndex;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function documentRowsComplete(rows: VectorMatch[]): boolean {
  if (!rows.length || !rows.every(isFormatV2)) return false;
  const totals = new Set(rows.map((row) => String(row.metadata?.totalChunks ?? '')));
  if (totals.size !== 1) return false;
  const total = Number([...totals][0]);
  if (!Number.isInteger(total) || total <= 0 || rows.length !== total) return false;
  const seen = new Set<number>();
  for (const row of rows) {
    const index = strictChunkIndex(row);
    if (index == null || index >= total || seen.has(index)) return false;
    seen.add(index);
  }
  return seen.size === total;
}

/**
 * Version-2 schema must be complete or the table is dropped.
 * `sqlexample` is never kept. Groups with no version-2 schema stay as stored.
 */
export function finalizeRetrievedGroup(matches: VectorMatch[]): VectorMatch[] | null {
  const schemaMatches = matches.filter((match) => {
    const type = docTypeOf(match);
    return !type || type === 'schema';
  });
  const v2 = schemaMatches.filter(isFormatV2);
  const schemaIds = [...new Set(v2.filter((match) => docTypeOf(match) === 'schema').map(documentIdOf))];
  if (!schemaIds.length) return schemaMatches.length ? schemaMatches : null;

  const kept: VectorMatch[] = [];
  let schemaOk = false;
  for (const id of schemaIds) {
    const rows = v2.filter((match) => documentIdOf(match) === id);
    if (!documentRowsComplete(rows)) continue;
    kept.push(...rows);
    schemaOk = true;
  }
  if (!schemaOk) return null;
  return kept;
}

function chunkIndex(match: VectorMatch): number {
  const raw = match.metadata?.chunkIndex ?? /(?:chunk-|::c)(\d+)$/i.exec(String(match.id ?? ''))?.[1];
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function documentIdOf(match: VectorMatch): string {
  return metadataValue(match, 'documentId') || String(match.id ?? '').replace(/::c(?:hunk-)?\d+$/i, '') || matchToSnippet(match).slice(0, 40);
}

export function mergeMatches(...lists: VectorMatch[][]): VectorMatch[] {
  const byId = new Map<string, VectorMatch>();
  for (const list of lists) {
    for (const match of list) {
      const id =
        String(match.id ?? '') ||
        `${documentIdOf(match)}::${chunkIndex(match)}::${matchToSnippet(match).slice(0, 24)}`;
      const prev = byId.get(id);
      if (!prev || (match.score ?? 0) > (prev.score ?? 0)) byId.set(id, { ...match, id: match.id ?? id });
    }
  }
  return [...byId.values()];
}

export function pickRelatedGroups(matches: VectorMatch[], groupBy: string, topK: number): string[] {
  const best = new Map<string, number>();
  for (const match of matches) {
    const key = resolveGroupKey(match, groupBy);
    if (!key) continue;
    best.set(key, Math.max(best.get(key) ?? 0, match.score ?? 0));
  }
  return [...best.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(1, topK))
    .map(([key]) => key);
}

function docTypeOf(match: VectorMatch): string {
  return metadataValue(match, 'docType');
}

function orderDocuments(
  docs: Array<{ docType: string; documentId: string; text: string; score: number }>,
): Array<{ docType: string; documentId: string; text: string; score: number }> {
  return [...docs].sort((a, b) => {
    const ao = DOC_TYPE_ORDER[a.docType] ?? 50;
    const bo = DOC_TYPE_ORDER[b.docType] ?? 50;
    return ao - bo || b.score - a.score || a.documentId.localeCompare(b.documentId);
  });
}

export function assembleGroupSnippet(groupKey: string, matches: VectorMatch[]): {
  text: string;
  source?: string;
  documentId?: string;
  score?: number;
  docType?: string;
  tableName?: string;
  schemaName?: string;
} {
  const byDocument = new Map<string, VectorMatch[]>();
  for (const match of matches) {
    const id = documentIdOf(match);
    const list = byDocument.get(id) ?? [];
    list.push(match);
    byDocument.set(id, list);
  }

  const docs = [...byDocument.entries()].map(([documentId, chunks]) => {
    const versioned = chunks.every(isFormatV2);
    const stitched = versioned
      ? stitchExact(
          chunks.map((chunk) => ({
            index: strictChunkIndex(chunk) ?? 0,
            text: String(chunk.metadata?.text ?? ''),
          })),
        )
      : stitchChunkTexts(
          chunks.map((chunk) => ({ index: chunkIndex(chunk), text: matchToSnippet(chunk) })),
        );
    const first = chunks[0];
    return {
      documentId,
      docType: first ? docTypeOf(first) : '',
      text: stitched,
      score: Math.max(...chunks.map((c) => c.score ?? 0), 0),
      source: first ? metadataValue(first, 'source') : '',
    };
  });

  const ordered = orderDocuments(docs);
  const tableName = matches.map((m) => metadataValue(m, 'tableName')).find(Boolean);
  const schemaName = matches.map((m) => metadataValue(m, 'schemaName')).find(Boolean);
  const useHeadings = ordered.length > 1 || ordered.some((d) => d.docType) || Boolean(tableName);
  const parts = ordered
    .map((doc) => {
      const heading = doc.docType || doc.documentId;
      return heading ? `## ${heading}\n${doc.text}` : doc.text;
    })
    .filter((part) => part.trim());

  const text = useHeadings ? [`# ${groupKey}`, ...parts].join('\n\n').trim() : (ordered[0]?.text ?? '');
  const first = ordered[0];
  return {
    text,
    source: first?.source,
    documentId: first?.documentId,
    score: first?.score,
    docType: ordered.map((d) => d.docType).filter(Boolean).join(','),
    tableName: tableName || undefined,
    schemaName: schemaName || undefined,
  };
}

export function groupDocumentIds(matches: VectorMatch[]): string[] {
  return [...new Set(matches.map(documentIdOf).filter(Boolean))];
}

/** Version-2 documents only. Missing totalChunks means the document cannot be hydrated. */
export function totalChunksForDocument(documentId: string, matches: VectorMatch[]): number {
  let maxKnown = 0;
  for (const match of matches) {
    if (documentIdOf(match) !== documentId || !isFormatV2(match)) continue;
    const fromMeta = Number(match.metadata?.totalChunks);
    if (Number.isFinite(fromMeta) && fromMeta > 0) {
      maxKnown = Math.max(maxKnown, Math.floor(fromMeta));
    }
  }
  return maxKnown;
}

export async function chunkIdsForDocument(documentId: string, totalChunks?: number): Promise<string[]> {
  const n =
    totalChunks != null && Number.isFinite(totalChunks) && totalChunks > 0
      ? Math.max(0, Math.floor(totalChunks))
      : 0;
  const ids: string[] = [];
  for (let i = 0; i < n; i++) ids.push(await vectorChunkId(documentId, i));
  return ids;
}

export function matchesFromVectorRows(
  rows: Array<{ id?: string; metadata?: Record<string, string>; score?: number }>,
): VectorMatch[] {
  return rows
    .filter((row) => row && (row.metadata || row.id))
    .map((row) => ({
      id: row.id,
      score: row.score,
      metadata: row.metadata,
    }));
}

export type SchemaColumn = {
  name: string;
  type: string;
  nullable: string;
  key: string;
  description: string;
  aliases: string;
};

export type ParsedSchema = {
  heading: string;
  schemaName: string;
  tableName: string;
  summaryVi: string;
  summaryEn: string;
  columns: SchemaColumn[];
};

export type SqlPairView = { question: string; sql: string; score: number };
export type SchemaView = { text: string; tableName: string; schemaName: string; score: number };
export type RagSnippetView = {
  text: string;
  docType: 'sqlpair' | 'schema';
  score: number;
  tableName?: string;
  schemaName?: string;
  source?: string;
  documentId?: string;
};

export type TwoPartRag = {
  sqlPairs: SqlPairView[];
  schemas: SchemaView[];
  snippets: RagSnippetView[];
  count: number;
  ragText: string;
};

export type ForeignKeyTarget = { tableName: string; schemaName?: string };

const STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'and', 'or', 'to', 'in', 'on', 'for', 'by', 'with', 'from', 'is', 'are', 'was', 'were',
  'be', 'been', 'being', 'this', 'that', 'these', 'those', 'what', 'which', 'who', 'how', 'when', 'where', 'why',
  'do', 'does', 'did', 'not', 'no', 'yes', 'it', 'its', 'as', 'at', 'into', 'per', 'than', 'then', 'if', 'but',
  'so', 'we', 'you', 'they', 'their', 'our', 'your',
  'và', 'của', 'các', 'những', 'cho', 'với', 'trong', 'trên', 'dưới', 'từ', 'đến', 'là', 'có', 'được', 'theo',
  'về', 'một', 'này', 'đó', 'nào', 'gì', 'khi', 'để', 'hay', 'hoặc', 'cũng', 'đã', 'sẽ', 'rất', 'như', 'ở', 'ra',
  'vào', 'lại', 'nên', 'thì', 'mà', 'bị', 'bởi', 'cái', 'nhiều', 'bao', 'nhiêu', 'không', 'nhưng', 'vì', 'nếu',
  'sau', 'trước', 'giữa', 'mỗi', 'tất', 'cả',
]);

const NO_PAIRS = '_Không có câu hỏi tương tự._';
const NO_SCHEMA = '_Không có bảng liên quan. Không bịa tên cột._';
const MAX_FALLBACK_COLUMNS = 12;

/** Stitch every chunk of one document back into the stored markdown. */
export function stitchedDocumentText(matches: VectorMatch[]): string {
  if (!matches.length) return '';
  const versioned = matches.every(isFormatV2);
  if (versioned) {
    return stitchExact(
      matches.map((chunk) => ({
        index: strictChunkIndex(chunk) ?? 0,
        text: String(chunk.metadata?.text ?? ''),
      })),
    );
  }
  return stitchChunkTexts(matches.map((chunk) => ({ index: chunkIndex(chunk), text: matchToSnippet(chunk) })));
}

export function questionTokens(question: string): string[] {
  const tokens = question
    .toLowerCase()
    .split(/[^\p{L}\p{N}_]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
  return [...new Set(tokens)];
}

function splitHeading(heading: string): { schemaName: string; tableName: string } {
  const dot = heading.indexOf('.');
  if (dot <= 0 || dot === heading.length - 1) return { schemaName: '', tableName: heading };
  return { schemaName: heading.slice(0, dot).trim(), tableName: heading.slice(dot + 1).trim() };
}

function splitCells(line: string): string[] {
  const placeholder = '\u0000';
  const parts = line
    .replace(/\\\|/g, placeholder)
    .split('|')
    .map((cell) => cell.replaceAll(placeholder, '|').trim());
  if (parts[0] === '') parts.shift();
  if (parts[parts.length - 1] === '') parts.pop();
  return parts;
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseColumnRows(lines: string[]): SchemaColumn[] {
  const columns: SchemaColumn[] = [];
  for (const line of lines) {
    if (!line.trim().startsWith('|')) break;
    const cells = splitCells(line);
    if (isSeparatorRow(cells) || cells.length < 6) continue;
    const [name, type, nullable, key, description, aliases] = cells;
    if (!name) continue;
    columns.push({
      name,
      type: type ?? '',
      nullable: nullable ?? '',
      key: key ?? '',
      description: description ?? '',
      aliases: aliases ?? '',
    });
  }
  return columns;
}

/** Heading, Vietnamese and English summaries, and column rows. Older sections are left out. */
export function parseSchemaDocument(
  text: string,
  fallback?: { schemaName?: string; tableName?: string },
): ParsedSchema {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let heading = '';
  const prose: string[] = [];
  let tableAt = -1;
  let fence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      fence = !fence;
      continue;
    }
    if (fence) continue;
    const headingMatch = /^#\s+(.+?)\s*$/.exec(line);
    if (!heading && headingMatch) {
      heading = headingMatch[1]?.trim() ?? '';
      continue;
    }
    if (/^\|\s*Column\s*\|/i.test(trimmed)) {
      tableAt = i;
      break;
    }
    if (!heading || /^#/.test(trimmed)) continue;
    if (trimmed) prose.push(trimmed);
  }
  const fromHeading = splitHeading(heading);
  const schemaName = (fallback?.schemaName || fromHeading.schemaName).trim();
  const tableName = (fallback?.tableName || fromHeading.tableName).trim();
  const title = schemaName && tableName ? `${schemaName}.${tableName}` : heading || tableName || schemaName;
  return {
    heading: title,
    schemaName,
    tableName,
    summaryVi: prose[0] ?? '',
    summaryEn: prose[1] ?? '',
    columns: tableAt >= 0 ? parseColumnRows(lines.slice(tableAt + 1)) : [],
  };
}

export function foreignKeyTargets(columns: SchemaColumn[]): ForeignKeyTarget[] {
  const targets: ForeignKeyTarget[] = [];
  const seen = new Set<string>();
  for (const column of columns) {
    const re = /FK\s*→\s*([A-Za-z0-9_$.]+)/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(column.key))) {
      const parts = (match[1] ?? '').split('.').filter(Boolean);
      if (parts.length < 2) continue;
      parts.pop();
      const tableName = parts.pop() ?? '';
      const schemaName = parts.join('.') || undefined;
      if (!tableName) continue;
      const id = `${(schemaName ?? '').toUpperCase()}.${tableName.toUpperCase()}`;
      if (seen.has(id)) continue;
      seen.add(id);
      targets.push({ tableName, schemaName });
    }
  }
  return targets;
}

function columnMatchesToken(column: SchemaColumn, tokens: string[]): boolean {
  const haystack = `${column.name} ${column.aliases} ${column.description}`.toLowerCase();
  return tokens.some((token) => haystack.includes(token));
}

function isKeyColumn(column: SchemaColumn): boolean {
  return /\bPK\b/.test(column.key) || /\bFK\b/.test(column.key);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sqlMentionsColumn(sql: string, name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const re = new RegExp(`(^|[^A-Za-z0-9_])${escapeRegExp(trimmed)}([^A-Za-z0-9_]|$)`, 'i');
  return re.test(sql);
}

/** Keep token matches, keys, and columns named in a retrieved SQL pair. No token hit keeps PK, FK, and the first 12. */
export function selectSchemaColumns(columns: SchemaColumn[], question: string, sqls: string[]): SchemaColumn[] {
  const tokens = questionTokens(question);
  const anyToken = columns.some((column) => columnMatchesToken(column, tokens));
  if (!anyToken) {
    return columns.filter((column, index) => index < MAX_FALLBACK_COLUMNS || isKeyColumn(column));
  }
  return columns.filter(
    (column) =>
      columnMatchesToken(column, tokens) ||
      isKeyColumn(column) ||
      sqls.some((sql) => sqlMentionsColumn(sql, column.name)),
  );
}

function escapeCell(value: string): string {
  return value.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
}

export function renderReducedSchema(parsed: ParsedSchema, columns: SchemaColumn[]): string {
  const title =
    parsed.schemaName && parsed.tableName
      ? `${parsed.schemaName}.${parsed.tableName}`
      : parsed.heading || parsed.tableName || parsed.schemaName || 'TABLE';
  const lines = [`# ${title}`];
  if (parsed.summaryVi) lines.push('', parsed.summaryVi);
  if (parsed.summaryEn) lines.push(parsed.summaryEn);
  if (columns.length) {
    lines.push('', '| Column | Type | Nullable | Key | Description | Aliases |');
    for (const column of columns) {
      lines.push(
        `| ${escapeCell(column.name)} | ${escapeCell(column.type)} | ${escapeCell(column.nullable)} | ${escapeCell(column.key)} | ${escapeCell(column.description)} | ${escapeCell(column.aliases)} |`,
      );
    }
  }
  return lines.join('\n').trim();
}

export function reduceSchemaText(
  text: string,
  question: string,
  sqls: string[],
  meta?: { schemaName?: string; tableName?: string },
): { text: string; targets: ForeignKeyTarget[]; schemaName: string; tableName: string } {
  const parsed = parseSchemaDocument(text, meta);
  const columns = selectSchemaColumns(parsed.columns, question, sqls);
  return {
    text: renderReducedSchema(parsed, columns),
    targets: foreignKeyTargets(parsed.columns),
    schemaName: parsed.schemaName,
    tableName: parsed.tableName,
  };
}

export function parseSqlPairText(text: string): { question: string; sql: string } | null {
  const match = /^Question:\s*([\s\S]*?)\n+```sql\s*\n([\s\S]*?)```/i.exec(text.trim());
  if (!match) return null;
  const question = match[1]?.trim() ?? '';
  const sql = match[2]?.trim() ?? '';
  if (!question || !sql) return null;
  return { question, sql };
}

function pairBlock(pair: SqlPairView): string {
  return `Question: ${pair.question}\n\`\`\`sql\n${pair.sql}\n\`\`\``;
}

function schemaTitle(schema: SchemaView): string {
  if (schema.schemaName && schema.tableName) return `${schema.schemaName}.${schema.tableName}`;
  return schema.tableName || schema.schemaName || 'TABLE';
}

/** Part 1 is question–SQL, part 2 is schema. Snippets follow that order. */
export function assembleTwoPartRag(sqlPairs: SqlPairView[], schemas: SchemaView[]): TwoPartRag {
  const pairSection = sqlPairs.length
    ? sqlPairs.map((pair, index) => `### ${index + 1}\n${pairBlock(pair)}`).join('\n\n')
    : NO_PAIRS;
  const schemaSection = schemas.length
    ? schemas.map((schema) => `### ${schemaTitle(schema)}\n${schema.text.trim()}`).join('\n\n')
    : NO_SCHEMA;
  const ragText = `## Câu hỏi và SQL\n\n${pairSection}\n\n## Schema liên quan\n\n${schemaSection}`;
  const snippets: RagSnippetView[] = [
    ...sqlPairs.map((pair) => ({
      text: pairBlock(pair),
      docType: 'sqlpair' as const,
      score: pair.score,
    })),
    ...schemas.map((schema) => ({
      text: schema.text,
      docType: 'schema' as const,
      score: schema.score,
      tableName: schema.tableName || undefined,
      schemaName: schema.schemaName || undefined,
    })),
  ];
  return {
    sqlPairs,
    schemas,
    snippets,
    count: sqlPairs.length + schemas.length,
    ragText,
  };
}
