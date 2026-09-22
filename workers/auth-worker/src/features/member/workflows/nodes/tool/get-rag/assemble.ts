import { matchToSnippet, type VectorMatch } from '../../../rag/index.js';

const MAX_CHUNKS_PER_DOCUMENT = 24;
const MIN_OVERLAP = 8;

/** Phase 3: schema before SQL examples for the Reasoning Agent. */
const DOC_TYPE_ORDER: Record<string, number> = {
  schema: 0,
  sqlexample: 1,
};

export function vectorChunkId(documentId: string, index: number): string {
  const raw = `${documentId}::chunk-${index}`;
  if (raw.length <= 64) return raw;
  const suffix = `::c${index}`;
  return raw.slice(0, 64 - suffix.length) + suffix;
}

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
    const stitched = stitchChunkTexts(
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

export function chunkIdsForDocument(documentId: string): string[] {
  return Array.from({ length: MAX_CHUNKS_PER_DOCUMENT }, (_, i) => vectorChunkId(documentId, i));
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
