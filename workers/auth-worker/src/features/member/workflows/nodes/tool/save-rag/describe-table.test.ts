import { describe, expect, it } from 'vitest';

import type { GetDbInfoResult } from '../shared/db/types.js';
import { chunkDocument, estimateEmbedTokens, EMBED_TOKEN_BUDGET } from './chunk.js';
import {
  COLUMN_SYSTEM,
  composeDescribeSystem,
  describeTable,
  enrichColumnBatches,
  parseTableEnrichmentForTests,
  resolveDescribeMaxTokens,
  SUMMARY_SYSTEM,
} from './describe-table.js';
import { ragDocumentsFromEnrichment } from './documents.js';

const info: GetDbInfoResult = {
  dbId: 'db',
  schemaName: 'ADMIN',
  tableName: 'ORDERS',
  columns: [
    { name: 'ID', type: 'NUMBER', nullable: false },
    { name: 'TOTAL', type: 'NUMBER', nullable: true },
  ],
  primaryKey: ['ID'],
  foreignKeys: [],
  ddl: 'CREATE TABLE ADMIN.ORDERS (ID NUMBER, TOTAL NUMBER);',
  sampleRows: [{ ID: 1, TOTAL: 10 }],
  sqlHistory: [],
};

describe('parseTableEnrichmentForTests', () => {
  it('keeps only columns that exist on the Oracle schema', () => {
    const enrichment = parseTableEnrichmentForTests(
      JSON.stringify({
        tableSummaryVi: 'Đơn',
        tableSummaryEn: 'Orders',
        columns: [
          { name: 'ID', descriptionVi: 'Khóa', descriptionEn: 'PK', aliasesVi: ['mã'] },
          { name: 'FAKE', descriptionVi: 'x', descriptionEn: 'x', aliasesVi: [] },
        ],
      }),
      info,
    );
    expect(enrichment.columns.map((c) => c.name)).toEqual(['ID']);
    expect(enrichment).not.toHaveProperty('typicalQueries');
  });

  it('matches column names case-insensitively and drops unknown names', () => {
    const enrichment = parseTableEnrichmentForTests(
      JSON.stringify({
        columns: [
          { name: 'order_id', descriptionVi: 'Mã', descriptionEn: 'Id', aliasesVi: [] },
          { name: 'FAKE', descriptionVi: 'x', descriptionEn: 'x', aliasesVi: [] },
        ],
      }),
      { ...info, columns: [{ name: 'ORDER_ID', type: 'NUMBER', nullable: false }] },
    );
    expect(enrichment.columns.map((col) => col.name)).toEqual(['ORDER_ID']);
  });

  it('keeps complete objects from truncated JSON and drops an unfinished tail', () => {
    const raw = `{
      "columns": [
        {"name":"ID","descriptionVi":"Khóa","descriptionEn":"PK","aliasesVi":[]},
        {"name":"TOTAL","descriptionVi":"Tổng","descriptionEn":"Total","aliasesVi":[]},
        {"name":"BROKEN","descriptionVi":"cắt`;
    const enrichment = parseTableEnrichmentForTests(raw, info);
    expect(enrichment.columns.map((col) => col.name)).toEqual(['ID', 'TOTAL']);
  });

  it('keeps a 240-character sentence and drops 241', () => {
    const enrichment = parseTableEnrichmentForTests(
      JSON.stringify({
        tableSummaryVi: 'a'.repeat(240),
        tableSummaryEn: 'b'.repeat(241),
        columns: [
          { name: 'ID', descriptionVi: 'a'.repeat(241), descriptionEn: 'PK', aliasesVi: [] },
          { name: 'TOTAL', descriptionVi: 'c'.repeat(240), descriptionEn: 'Total', aliasesVi: [] },
        ],
      }),
      info,
    );
    expect(enrichment.tableSummaryVi).toHaveLength(240);
    expect(enrichment.tableSummaryEn).toBe('');
    expect(enrichment.columns.map((col) => col.name)).toEqual(['TOTAL']);
  });
});

describe('composeDescribeSystem', () => {
  it('puts the domain prompt before the JSON rules', () => {
    const system = composeDescribeSystem(COLUMN_SYSTEM, '  Bạn là chuyên gia kế toán. Dùng doanh thu thuần.  ');
    expect(system.startsWith('Bạn là chuyên gia kế toán. Dùng doanh thu thuần.')).toBe(true);
    expect(system).toContain('doanh thu thuần');
    expect(system.indexOf('doanh thu thuần')).toBeLessThan(system.indexOf('Return ONLY one JSON object'));
    expect(system).toContain('at most 240 characters');
  });

  it('adds no role when the prompt is blank', () => {
    expect(composeDescribeSystem(SUMMARY_SYSTEM, '   ')).toBe(SUMMARY_SYSTEM);
    expect(composeDescribeSystem(COLUMN_SYSTEM, '')).toBe(COLUMN_SYSTEM);
  });
});

describe('resolveDescribeMaxTokens', () => {
  it('uses 8192 when the service value is empty or at most 1024', () => {
    expect(resolveDescribeMaxTokens(undefined)).toBe(8192);
    expect(resolveDescribeMaxTokens(1024)).toBe(8192);
    expect(resolveDescribeMaxTokens(4096)).toBe(4096);
  });
});

describe('enrichColumnBatches', () => {
  const column = (name: string) => ({ name, type: 'VARCHAR2', nullable: true });

  it('shrinks a partial 12-column batch to the next 2 incomplete columns', async () => {
    const columns = Array.from({ length: 12 }, (_, i) => column(`C${i}`));
    const takes: string[][] = [];
    await enrichColumnBatches(columns, async (take) => {
      takes.push(take.map((col) => col.name));
      const complete = take.length === 12 ? take.slice(0, 8) : take;
      return {
        records: complete.map((col) => ({
          name: col.name,
          descriptionVi: 'vi',
          descriptionEn: 'en',
          aliasesVi: [],
        })),
      };
    });
    expect(takes[0]).toHaveLength(12);
    expect(takes[1]).toEqual(['C8', 'C9']);
    expect(takes[1]).not.toEqual(expect.arrayContaining(['C0']));
  });

  it('asks for at least 4 column calls when the model returns 12 columns at a time', async () => {
    const columns = Array.from({ length: 40 }, (_, i) => column(`C${i}`));
    let calls = 0;
    const done = await enrichColumnBatches(columns, async (take) => {
      calls += 1;
      return {
        records: take.map((col) => ({
          name: col.name.toLowerCase(),
          descriptionVi: `vi-${col.name}`,
          descriptionEn: 'en',
          aliasesVi: [],
        })),
      };
    });
    expect(calls).toBeGreaterThanOrEqual(4);
    expect(done.map((col) => col.name)).toEqual(columns.map((col) => col.name));
    expect(done[0]?.descriptionVi).toBe('vi-C0');
    expect(done[39]?.descriptionVi).toBe('vi-C39');
  });

  it('throws when the same column fails twice at batch size 1 and does not return an empty enrichment', async () => {
    let calls = 0;
    await expect(
      enrichColumnBatches([column('ID')], async () => {
        calls += 1;
        return { records: [] };
      }),
    ).rejects.toThrow('save_rag: column "ID" enrichment failed');
    expect(calls).toBe(2);
  });
});

describe('describeTable guards', () => {
  it('throws for a table with zero columns before any model call', async () => {
    await expect(
      describeTable({ definition: { nodes: [], edges: [] }, node: { id: 'save' } } as never, {
        ...info,
        columns: [],
      }),
    ).rejects.toThrow('save_rag: table ORDERS has no columns');
  });
});

describe('schema documents', () => {
  it('writes one shortened schema with PK, FK, and both languages', () => {
    const docs = ragDocumentsFromEnrichment(
      {
        ...info,
        columns: [
          { name: 'ID', type: 'NUMBER', nullable: false, comment: 'oracle pk comment' },
          { name: 'CUSTOMER_ID', type: 'NUMBER', nullable: true },
        ],
        primaryKey: ['ID'],
        foreignKeys: [{ column: 'CUSTOMER_ID', refTable: 'CUSTOMERS', refColumn: 'ID' }],
      },
      {
        tableSummaryVi: 'Đơn hàng.',
        tableSummaryEn: 'Orders.',
        columns: [
          { name: 'ID', descriptionVi: 'Khóa\nchính.', descriptionEn: 'PK | key.', aliasesVi: ['mã', 'id'] },
          {
            name: 'CUSTOMER_ID',
            descriptionVi: 'Khách hàng.',
            descriptionEn: 'Customer.',
            aliasesVi: ['doanh thu thuần'],
          },
        ],
      },
    );
    expect(docs).toHaveLength(1);
    expect(docs[0]?.documentId).toBe('db.ADMIN.ORDERS.schema');
    expect(docs[0]?.metadata.docType).toBe('schema');
    expect(docs[0]?.content).toBe(`# ADMIN.ORDERS

Đơn hàng.
Orders.

| Column | Type | Nullable | Key | Description | Aliases |
| ID | NUMBER | NO | PK | VI: Khóa chính. EN: PK \\| key. | mã, id |
| CUSTOMER_ID | NUMBER | YES | FK → CUSTOMERS.ID | VI: Khách hàng. EN: Customer. | doanh thu thuần |
`);
    expect(docs[0]?.content).not.toContain('CREATE TABLE');
    expect(docs[0]?.content).not.toContain('oracle pk comment');
    expect(docs[0]?.content).not.toContain('sqlexample');
    expect(docs[0]?.content).not.toContain('---');
  });

  it('refuses a table that is missing one language or exceeds 240 characters', () => {
    const columns = [
      { name: 'ID', descriptionVi: 'Khóa', descriptionEn: 'PK', aliasesVi: [] as string[] },
      { name: 'TOTAL', descriptionVi: 'Tổng', descriptionEn: 'Total', aliasesVi: [] as string[] },
    ];
    expect(() =>
      ragDocumentsFromEnrichment(info, {
        tableSummaryVi: 'Đơn',
        tableSummaryEn: '',
        columns,
      }),
    ).toThrow('summary incomplete');
    expect(() =>
      ragDocumentsFromEnrichment(info, {
        tableSummaryVi: 'a'.repeat(241),
        tableSummaryEn: 'Orders',
        columns,
      }),
    ).toThrow('summary incomplete');
    expect(() =>
      ragDocumentsFromEnrichment(info, {
        tableSummaryVi: 'Đơn',
        tableSummaryEn: 'Orders',
        columns: [{ name: 'ID', descriptionVi: 'Khóa', descriptionEn: '', aliasesVi: [] }],
      }),
    ).toThrow('column "ID" enrichment incomplete');
  });

  it('keeps the first and last column descriptions across schema chunks', () => {
    const columns = Array.from({ length: 40 }, (_, i) => ({
      name: `C${i}`,
      type: 'VARCHAR2(4000)',
      nullable: true,
      comment: `note ${i} with a pipe | inside`,
    }));
    const ddl = `CREATE TABLE ADMIN.WIDE (\n${columns.map((col) => `  ${col.name} VARCHAR2(4000)`).join(',\n')}\n);`;
    const wide: GetDbInfoResult = {
      ...info,
      columns,
      ddl,
      sampleRows: [],
    };
    const enrichment = {
      tableSummaryVi: 'Rộng',
      tableSummaryEn: 'Wide',
      columns: columns.map((col) => ({
        name: col.name,
        descriptionVi: `mô tả ${col.name}`,
        descriptionEn: `desc ${col.name}`,
        aliasesVi: [`bí danh ${col.name}`],
      })),
    };
    const content = ragDocumentsFromEnrichment(wide, enrichment)[0]!.content;
    const chunks = chunkDocument(content, { docType: 'schema', tableName: 'ORDERS' });
    const joined = chunks.map((chunk) => chunk.content).join('');
    expect(joined).toBe(content);
    const stored = chunks.map((chunk) => chunk.content).join('\n');
    expect(stored).toContain('mô tả C0');
    expect(stored).toContain('mô tả C39');
    expect(joined).not.toContain(ddl);
    for (const chunk of chunks) {
      expect(estimateEmbedTokens(chunk.content)).toBeLessThanOrEqual(EMBED_TOKEN_BUDGET);
    }
  });
});
