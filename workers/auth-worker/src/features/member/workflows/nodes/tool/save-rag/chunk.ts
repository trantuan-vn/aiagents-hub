/** Split text into overlapping chunks for RAG ingest. */

export type TextChunk = {
  content: string;
  index: number;
};

export function chunkText(text: string, chunkSize = 800, chunkOverlap = 120): TextChunk[] {
  const normalized = text.trim();
  if (!normalized) return [];

  if (normalized.length <= chunkSize) {
    return [{ content: normalized, index: 0 }];
  }

  const chunks: TextChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < normalized.length) {
    const end = Math.min(start + chunkSize, normalized.length);
    chunks.push({ content: normalized.slice(start, end), index });
    if (end >= normalized.length) break;
    start = Math.max(0, end - chunkOverlap);
    index += 1;
  }

  return chunks;
}

/** Stay under bge-m3's 8192 input tokens. Over-estimates; whitespace is not counted. */
export const EMBED_TOKEN_BUDGET = 7680;
/** Vectorize metadata objects must stay under 10 KiB. Leave headroom. */
export const METADATA_BYTE_BUDGET = 8 * 1024;

export function estimateEmbedTokens(text: string): number {
  let tokens = 0;
  let ascii = 0;
  const flush = () => {
    if (ascii <= 0) return;
    tokens += Math.max(1, Math.ceil(ascii / 3));
    ascii = 0;
  };
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 128 && /[A-Za-z0-9]/.test(ch)) {
      ascii += 1;
      continue;
    }
    flush();
    if (!/\s/u.test(ch)) tokens += 1;
  }
  flush();
  return tokens;
}

function metadataBytes(text: string, fields: Record<string, string>): number {
  const meta: Record<string, string> = {
    text,
    source: fields.source ?? '',
    documentId: fields.documentId ?? '',
    chunkIndex: '99999',
    totalChunks: '99999',
    docType: fields.docType ?? '',
    tableName: fields.tableName ?? '',
    schemaName: fields.schemaName ?? '',
    dbId: fields.dbId ?? '',
    formatVersion: '2',
  };
  if (fields.namespace) meta.namespace = fields.namespace;
  return new TextEncoder().encode(JSON.stringify(meta)).length;
}

function fitsChunk(text: string, fields: Record<string, string>): boolean {
  return estimateEmbedTokens(text) <= EMBED_TOKEN_BUDGET && metadataBytes(text, fields) <= METADATA_BYTE_BUDGET;
}

function linesKeepingBreaks(text: string): string[] {
  const parts: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      parts.push(text.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < text.length) parts.push(text.slice(start));
  return parts;
}

function columnNameFromRow(line: string): string {
  const cells = line.split('|');
  return (cells[1] ?? '').replace(/\\\|/g, '|').trim() || 'unknown';
}

function splitCodePoints(line: string, fields: Record<string, string>): string[] {
  const chars = [...line];
  const out: string[] = [];
  let rest = chars;
  while (rest.length) {
    const whole = rest.join('');
    if (fitsChunk(whole, fields)) {
      out.push(whole);
      break;
    }
    let lo = 1;
    let hi = rest.length - 1;
    let best = 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (fitsChunk(rest.slice(0, mid).join(''), fields)) {
        best = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    const piece = rest.slice(0, best).join('');
    if (!fitsChunk(piece, fields)) {
      throw new Error('save_rag: chunk budget too small for one character');
    }
    out.push(piece);
    rest = rest.slice(best);
  }
  return out;
}

/**
 * Exact slices of a schema or SQL document. Joining chunk text with '' reproduces `text`.
 * A markdown table row is never split. A single oversized DDL or comment line may be.
 */
export function chunkDocument(text: string, fields: Record<string, string> = {}): TextChunk[] {
  if (!text) return [];
  const pieces: string[] = [];
  for (const line of linesKeepingBreaks(text)) {
    if (line.startsWith('|')) {
      if (!fitsChunk(line, fields)) {
        throw new Error(`save_rag: column "${columnNameFromRow(line)}" exceeds chunk budget`);
      }
      pieces.push(line);
      continue;
    }
    pieces.push(...splitCodePoints(line, fields));
  }

  const chunks: TextChunk[] = [];
  let buf = '';
  const push = () => {
    if (!buf) return;
    chunks.push({ content: buf, index: chunks.length });
    buf = '';
  };
  for (const piece of pieces) {
    if (!buf) {
      buf = piece;
      continue;
    }
    if (fitsChunk(buf + piece, fields)) buf += piece;
    else {
      push();
      buf = piece;
    }
  }
  push();
  return chunks;
}
