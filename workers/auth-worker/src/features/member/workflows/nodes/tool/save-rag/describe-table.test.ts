import { describe, expect, it } from 'vitest';

import type { GetDbInfoResult } from '../shared/db/types.js';
import { parseTableEnrichmentForTests } from './describe-table.js';

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
        typicalQueries: [
          { titleVi: 'Đếm', titleEn: 'Count', sql: 'SELECT COUNT(*) FROM ADMIN.ORDERS', noteVi: 'n' },
          { titleVi: 'Bad', titleEn: 'Bad', sql: 'DELETE FROM ADMIN.ORDERS', noteVi: 'n' },
        ],
      }),
      info,
    );
    expect(enrichment.columns.map((c) => c.name)).toEqual(['ID']);
    expect(enrichment.typicalQueries).toHaveLength(1);
    expect(enrichment.typicalQueries[0]?.sql).toMatch(/^SELECT/i);
  });
});
