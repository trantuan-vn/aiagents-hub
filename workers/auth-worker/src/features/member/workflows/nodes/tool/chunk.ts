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
