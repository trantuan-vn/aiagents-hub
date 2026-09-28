import { describe, expect, it } from 'vitest';

import { chunkText } from '../save-rag/chunk.js';
import { vectorChunkId as sharedVectorChunkId } from '../../../rag/index.js';
import {
  assembleGroupSnippet,
  chunkIdsForDocument,
  finalizeRetrievedGroup,
  inferGroupBy,
  overlapJoin,
  pickRelatedGroups,
  resolveGroupKey,
  stitchChunkTexts,
  stitchExact,
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

  it('assembles schema before sqlexample and keeps schemaName', () => {
    const snippet = assembleGroupSnippet('CHUNG_KHOAN', [
      {
        score: 0.5,
        metadata: {
          tableName: 'CHUNG_KHOAN',
          schemaName: 'ADMIN',
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
          schemaName: 'ADMIN',
          docType: 'schema',
          documentId: 'db.ADMIN.CHUNG_KHOAN.schema',
          chunkIndex: '0',
          text: '## Columns\n- MA_CK: Mã chứng khoán / Ticker (aliases: mã CK)',
        },
      },
    ]);
    expect(snippet.schemaName).toBe('ADMIN');
    expect(snippet.tableName).toBe('CHUNG_KHOAN');
    expect(snippet.text).toContain('# CHUNG_KHOAN');
    expect(snippet.text.indexOf('## schema')).toBeLessThan(snippet.text.indexOf('## sqlexample'));
    expect(snippet.text).toContain('aliases: mã CK');
    expect(snippet.text).toContain('SELECT * FROM ADMIN.CHUNG_KHOAN');
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

  it('uses the same 64-hex id as Save RAG', async () => {
    const long = 'db.ADMIN.VECTOR$IDX_SCHEMA_EMBEDDING$149222_149231_0$IVF_FLAT_CENTROIDS.schema';
    const id = await vectorChunkId(long, 1);
    expect(id).toHaveLength(64);
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    expect(id).toBe(await sharedVectorChunkId(long, 1));
    expect(await vectorChunkId(`${long}x`, 1)).not.toBe(id);
  });

  it('joins a mid-line split with no extra character', () => {
    const left = 'CREATE TABLE ADMIN.T (MA_CK VARCHAR2(20)';
    const right = ' NOT NULL);';
    expect(stitchExact([
      { index: 1, text: right },
      { index: 0, text: left },
    ])).toBe(left + right);
  });

  it('requests every chunk id and pages past 100', async () => {
    const ids = await chunkIdsForDocument('db.ADMIN.T.schema', 30);
    expect(ids).toHaveLength(30);
    expect(new Set(ids).size).toBe(30);
    const many = await chunkIdsForDocument('db.ADMIN.T.schema', 130);
    expect(many).toHaveLength(130);
    expect(many[0]).toBe(ids[0]);
  });

  it('drops a version-2 table when a chunk is missing and keeps schema without sqlexample', () => {
    const schema = (index: number, total: number) => ({
      id: `s${index}`,
      score: 0.8,
      metadata: {
        formatVersion: '2',
        docType: 'schema',
        documentId: 'db.ADMIN.T.schema',
        tableName: 'T',
        chunkIndex: String(index),
        totalChunks: String(total),
        text: `part-${index}`,
      },
    });
    expect(finalizeRetrievedGroup([schema(0, 2)])).toBeNull();
    const kept = finalizeRetrievedGroup([schema(0, 1), {
      score: 0.2,
      metadata: { text: 'legacy', docType: 'schema', documentId: 'old' },
    }]);
    expect(kept?.map((row) => row.metadata?.text)).toEqual(['part-0']);
  });

  it('does not stitch a non-version-2 chunk into a version-2 schema', () => {
    const snippet = assembleGroupSnippet('T', [
      {
        id: 's0',
        score: 0.9,
        metadata: {
          formatVersion: '2',
          docType: 'schema',
          documentId: 'db.ADMIN.T.schema',
          tableName: 'T',
          chunkIndex: '0',
          totalChunks: '1',
          text: 'CREATE TABLE T (ID NUMBER);',
          content: 'should-not-read',
        },
      },
    ]);
    expect(snippet.text).toContain('CREATE TABLE T (ID NUMBER);');
    expect(snippet.text).not.toContain('should-not-read');
  });
});
