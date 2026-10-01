import { describe, expect, it } from 'vitest';

import { chunkText } from '../save-rag/chunk.js';
import { vectorChunkId as sharedVectorChunkId } from '../../../rag/index.js';
import {
  assembleGroupSnippet,
  assembleTwoPartRag,
  chunkIdsForDocument,
  finalizeRetrievedGroup,
  inferGroupBy,
  overlapJoin,
  parseSqlPairText,
  pickRelatedGroups,
  reduceSchemaText,
  resolveGroupKey,
  selectSchemaColumns,
  stitchChunkTexts,
  stitchExact,
  vectorChunkId,
  type SchemaColumn,
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

  it('puts every sqlpair snippet before schema and keeps both headings', () => {
    const rag = assembleTwoPartRag(
      [{ question: 'doanh thu theo tháng', sql: 'SELECT SUM(AMOUNT) FROM SALES.ORDERS', score: 0.4 }],
      [{
        text: '# SALES.ORDERS\n\nĐơn hàng.\nOrders.',
        tableName: 'ORDERS',
        schemaName: 'SALES',
        score: 0.9,
      }],
    );
    expect(rag.ragText.indexOf('## Câu hỏi và SQL')).toBeLessThan(rag.ragText.indexOf('## Schema liên quan'));
    expect(rag.ragText).toContain('Question: doanh thu theo tháng');
    expect(rag.ragText).toContain('SELECT SUM(AMOUNT) FROM SALES.ORDERS');
    expect(rag.ragText).toContain('### SALES.ORDERS');
    expect(rag.snippets.map((snippet) => snippet.docType)).toEqual(['sqlpair', 'schema']);
    expect(rag.count).toBe(2);
    expect(rag.ragText).not.toContain('sqlexample');
  });

  it('says when either part is missing', () => {
    const rag = assembleTwoPartRag([], []);
    expect(rag.ragText).toContain('_Không có câu hỏi tương tự._');
    expect(rag.ragText).toContain('_Không có bảng liên quan. Không bịa tên cột._');
    expect(rag.count).toBe(0);
    expect(rag.snippets).toEqual([]);
  });

  it('drops old document junk and keeps columns the question or SQL mentions', () => {
    const stored = `# SALES.ORDERS

Doanh thu đơn hàng.
Order revenue.

## DDL
\`\`\`sql
CREATE TABLE SALES.ORDERS (ID NUMBER);
\`\`\`

| Column | Type | Nullable | Key | Description | Aliases |
| --- | --- | --- | --- | --- | --- |
| ORDER_ID | NUMBER | NO | PK | VI: Mã đơn. EN: Order id. | mã đơn |
| CUSTOMER_ID | NUMBER | YES | FK → CUSTOMERS.ID | VI: Khách hàng. EN: Customer. | khách |
| AMOUNT | NUMBER | YES |  | VI: Doanh thu thuần. EN: Net revenue. | doanh thu |
| NOTE | VARCHAR2 | YES |  | VI: Ghi chú. EN: Note. | ghi chú |
`;
    const reduced = reduceSchemaText(stored, 'doanh thu theo tháng', ['SELECT AMOUNT FROM SALES.ORDERS']);
    expect(reduced.text).toContain('# SALES.ORDERS');
    expect(reduced.text).toContain('Doanh thu đơn hàng.');
    expect(reduced.text).toContain('AMOUNT');
    expect(reduced.text).toContain('ORDER_ID');
    expect(reduced.text).toContain('CUSTOMER_ID');
    expect(reduced.text).not.toContain('CREATE TABLE');
    expect(reduced.text).not.toContain('NOTE');
    expect(reduced.targets).toEqual([{ tableName: 'CUSTOMERS' }]);
    expect(parseSqlPairText('Question: doanh thu theo tháng\n\n```sql\nSELECT 1\n```')).toEqual({
      question: 'doanh thu theo tháng',
      sql: 'SELECT 1',
    });
  });

  it('keeps primary keys, foreign keys, and the first 12 columns when nothing matches the question', () => {
    const columns: SchemaColumn[] = [
      { name: 'ID', type: 'NUMBER', nullable: 'NO', key: 'PK', description: 'id', aliases: '' },
      ...Array.from({ length: 12 }, (_, index) => ({
        name: `C${index}`,
        type: 'NUMBER',
        nullable: 'YES',
        key: '',
        description: 'other',
        aliases: '',
      })),
      { name: 'PARENT_ID', type: 'NUMBER', nullable: 'YES', key: 'FK → PARENT.ID', description: 'parent', aliases: '' },
    ];
    const kept = selectSchemaColumns(columns, 'completely unrelated', []);
    expect(kept.map((column) => column.name)).toEqual(['ID', ...Array.from({ length: 11 }, (_, index) => `C${index}`), 'PARENT_ID']);
    expect(kept.some((column) => column.name === 'C11')).toBe(false);
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
