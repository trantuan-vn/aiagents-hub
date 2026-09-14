import { describe, expect, it } from 'vitest';

import { chunkText } from '../save-rag/chunk.js';
import {
  assembleGroupSnippet,
  inferGroupBy,
  overlapJoin,
  pickRelatedGroups,
  resolveGroupKey,
  stitchChunkTexts,
  vectorChunkId,
} from './assemble.js';

describe('assemble RAG documents', () => {
  it('joins overlapping Save RAG chunks back into the original text', () => {
    const original =
      '## DDL\n```sql\nCREATE TABLE ADMIN.CHUNG_KHOAN (MA_CK VARCHAR2(20) NOT NULL, TEN_CK VARCHAR2(100));\n```\n\n## Sample shape (from live data)\n```json\n[{ "MA_CK": "VIC", "TEN_CK": "Vingroup" }]\n```';
    const chunks = chunkText(original, 80, 20);
    expect(chunks.length).toBeGreaterThan(1);
    const stitched = stitchChunkTexts(chunks.map((c) => ({ index: c.index, text: c.content })));
    expect(stitched).toBe(original);
  });

  it('overlapJoin prefers the longest shared suffix/prefix', () => {
    expect(overlapJoin('hello overlapping', 'overlapping text')).toBe('hello overlapping text');
  });

  it('groups related docs by the user-configured metadata key', () => {
    const matches = [
      {
        score: 0.9,
        metadata: { tableName: 'CHUNG_KHOAN', text: 'tail', docType: 'schema' },
      },
      {
        score: 0.4,
        metadata: { tableName: 'NHA_DAU_TU', text: 'other', docType: 'schema' },
      },
    ];
    expect(inferGroupBy(matches, 'tableName')).toBe('tableName');
    expect(resolveGroupKey(matches[0]!, 'tableName')).toBe('CHUNG_KHOAN');
    expect(pickRelatedGroups(matches, 'tableName', 1)).toEqual(['CHUNG_KHOAN']);
  });

  it('assembles schema and sample data for one related table', () => {
    const snippet = assembleGroupSnippet('CHUNG_KHOAN', [
      {
        score: 0.5,
        metadata: {
          tableName: 'CHUNG_KHOAN',
          docType: 'sqlexample',
          documentId: 'db.ADMIN.CHUNG_KHOAN.sqlexample',
          chunkIndex: '0',
          text: 'SELECT * FROM ADMIN.CHUNG_KHOAN LIMIT 50;',
        },
      },
      {
        score: 0.7,
        metadata: {
          tableName: 'CHUNG_KHOAN',
          docType: 'schema',
          documentId: 'db.ADMIN.CHUNG_KHOAN.schema',
          chunkIndex: '0',
          text: '## DDL\nCREATE TABLE ADMIN.CHUNG_KHOAN (MA_CK VARCHAR2(20));',
        },
      },
      {
        score: 0.8,
        metadata: {
          tableName: 'CHUNG_KHOAN',
          docType: 'schema',
          documentId: 'db.ADMIN.CHUNG_KHOAN.schema',
          chunkIndex: '1',
          text: '## Sample shape (from live data)\n```json\n[{ "MA_CK": "VIC" }]\n```',
        },
      },
    ]);
    expect(snippet.text).toContain('# CHUNG_KHOAN');
    expect(snippet.text).toContain('## schema');
    expect(snippet.text).toContain('CREATE TABLE');
    expect(snippet.text).toContain('VIC');
    expect(snippet.text).toContain('## sqlexample');
    expect(snippet.text).toContain('SELECT * FROM ADMIN.CHUNG_KHOAN');
  });

  it('matches Save RAG vector ids including truncated names', () => {
    expect(vectorChunkId('short', 0)).toBe('short::chunk-0');
    const long = 'db.ADMIN.VECTOR$IDX_SCHEMA_EMBEDDING$149222_149231_0$IVF_FLAT_CENTROIDS.schema';
    expect(vectorChunkId(long, 1).length).toBeLessThanOrEqual(64);
    expect(vectorChunkId(long, 1)).toMatch(/::c1$/);
  });
});
