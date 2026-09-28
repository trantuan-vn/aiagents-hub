import { describe, expect, it } from 'vitest';

import { chunkDocument, estimateEmbedTokens, EMBED_TOKEN_BUDGET, METADATA_BYTE_BUDGET } from './chunk.js';

describe('chunkDocument', () => {
  it('splits a long DDL line on a character boundary and joins back exactly', () => {
    const ddl = `CREATE TABLE ADMIN.T (${'A'.repeat(9000)});`;
    const chunks = chunkDocument(ddl, { docType: 'schema', documentId: 'db.ADMIN.T.schema' });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((chunk) => chunk.content).join('')).toBe(ddl);
    for (const chunk of chunks) {
      expect(estimateEmbedTokens(chunk.content)).toBeLessThanOrEqual(EMBED_TOKEN_BUDGET);
      const bytes = new TextEncoder().encode(
        JSON.stringify({
          text: chunk.content,
          chunkIndex: '99999',
          totalChunks: '99999',
          formatVersion: '2',
          docType: 'schema',
          documentId: 'db.ADMIN.T.schema',
        }),
      ).length;
      expect(bytes).toBeLessThanOrEqual(METADATA_BYTE_BUDGET);
    }
  });

  it('refuses to split a markdown table row that does not fit', () => {
    const row = `| TOTAL | NUMBER | NO |  | ${'mô tả '.repeat(2000)} | en | alias |`;
    expect(() => chunkDocument(`${row}\n`, { docType: 'schema' })).toThrow(/column "TOTAL" exceeds chunk budget/);
  });
});