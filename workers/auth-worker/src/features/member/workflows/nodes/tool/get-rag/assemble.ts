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
 * A missing sqlexample does not drop a complete schema.
 * Groups with no version-2 schema stay as stored (older snippets).
 */
export function finalizeRetrievedGroup(matches: VectorMatch[]): VectorMatch[] | null {
  const v2 = matches.filter(isFormatV2);
  const schemaIds = [...new Set(v2.filter((match) => docTypeOf(match) === 'schema').map(documentIdOf))];
  if (!schemaIds.length) return matches;

  const kept: VectorMatch[] = [];
  let schemaOk = false;
  for (const id of schemaIds) {
    const rows = v2.filter((match) => documentIdOf(match) === id);
    if (!documentRowsComplete(rows)) continue;
    kept.push(...rows);
    schemaOk = true;
  }
  if (!schemaOk) return null;

  const sqlIds = [...new Set(v2.filter((match) => docTypeOf(match) === 'sqlexample').map(documentIdOf))];
  for (const id of sqlIds) {
    const rows = v2.filter((match) => documentIdOf(match) === id);
    if (documentRowsComplete(rows)) kept.push(...rows);
  }
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
