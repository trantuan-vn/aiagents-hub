import { describe, expect, it } from 'vitest';

import {
  applyStructuredFilter,
  defaultFilterCondition,
  defaultFilterValue,
  evaluateFilterFromNodeData,
  evaluateFilterValue,
} from '@aiagents-hub/workflow-nodes';

import { resolveActiveBranchHandles } from './flow-helpers.js';

describe('evaluateFilterValue', () => {
  it('matches string equals', () => {
    const filter = defaultFilterValue();
    filter.conditions[0] = {
      ...defaultFilterCondition(),
      leftValue: '{{ $json.name }}',
      rightValue: 'Ada',
      operator: { type: 'string', operation: 'equals' },
    };
    expect(evaluateFilterValue(filter, { name: 'Ada' })).toBe(true);
    expect(evaluateFilterValue(filter, { name: 'Bob' })).toBe(false);
  });

  it('ignores case when asked', () => {
    const filter = defaultFilterValue();
    filter.conditions[0] = {
      ...defaultFilterCondition(),
      leftValue: '{{ $json.name }}',
      rightValue: 'ada',
      operator: { type: 'string', operation: 'equals' },
    };
    expect(evaluateFilterValue(filter, { name: 'Ada' }, { ignoreCase: true })).toBe(true);
    expect(evaluateFilterValue(filter, { name: 'Ada' }, { ignoreCase: false })).toBe(false);
  });

  it('combines conditions with AND / OR', () => {
    const andFilter = defaultFilterValue();
    andFilter.combinator = 'and';
    andFilter.conditions = [
      { id: '1', leftValue: '{{ $json.a }}', rightValue: '1', operator: { type: 'string', operation: 'equals' } },
      { id: '2', leftValue: '{{ $json.b }}', rightValue: '2', operator: { type: 'string', operation: 'equals' } },
    ];
    expect(evaluateFilterValue(andFilter, { a: '1', b: '2' })).toBe(true);
    expect(evaluateFilterValue(andFilter, { a: '1', b: 'x' })).toBe(false);

    const orFilter = { ...andFilter, combinator: 'or' as const };
    expect(evaluateFilterValue(orFilter, { a: '1', b: 'x' })).toBe(true);
  });

  it('converts types when loose validation is on', () => {
    const filter = defaultFilterValue();
    filter.conditions[0] = {
      ...defaultFilterCondition(),
      leftValue: '{{ $json.count }}',
      rightValue: '2',
      operator: { type: 'number', operation: 'gt' },
    };
    expect(evaluateFilterValue(filter, { count: '3' }, { looseTypeValidation: true })).toBe(true);
    expect(evaluateFilterValue(filter, { count: '3' }, { looseTypeValidation: false })).toBe(false);
  });
});

describe('flow filter branches', () => {
  it('activates out when structured conditions match', () => {
    const data = {
      flowKind: 'filter',
      conditions: {
        combinator: 'and',
        conditions: [
          {
            id: '1',
            leftValue: '{{ $json.tableName }}',
            rightValue: 'EMP',
            operator: { type: 'string', operation: 'equals' },
          },
        ],
      },
      options: {},
      looseTypeValidation: false,
    };
    const scope = { tableName: 'EMP' };
    expect(resolveActiveBranchHandles('filter', data, scope, scope).has('out')).toBe(true);
    expect(resolveActiveBranchHandles('filter', data, { tableName: 'DEPT' }, { tableName: 'DEPT' }).has('out')).toBe(
      false,
    );
  });

  it('falls back to the legacy condition expression', () => {
    const data = { flowKind: 'filter', condition: '{{ $json.ok }}' };
    expect(resolveActiveBranchHandles('filter', data, { ok: true }, { ok: true }).has('out')).toBe(true);
    expect(resolveActiveBranchHandles('filter', data, { ok: false }, { ok: false }).has('out')).toBe(false);
  });

  it('does not reopen a filter that already dropped every row', () => {
    const data = {
      flowKind: 'filter',
      conditions: {
        combinator: 'and',
        conditions: [
          {
            id: '1',
            leftValue: '{{ $json.items[0].tableName }}',
            rightValue: 'RAG',
            operator: { type: 'string', operation: 'notContains' },
          },
        ],
      },
    };
    expect(resolveActiveBranchHandles('filter', data, { filtered: false, items: [] }, { filtered: false }).has('out')).toBe(
      false,
    );
  });

  it('reads ignoreCase from options', () => {
    const data = {
      flowKind: 'filter',
      conditions: {
        combinator: 'and',
        conditions: [
          {
            id: '1',
            leftValue: '{{ $json.name }}',
            rightValue: 'ada',
            operator: { type: 'string', operation: 'equals' },
          },
        ],
      },
      options: { ignoreCase: true },
    };
    expect(evaluateFilterFromNodeData(data, { name: 'Ada' })).toBe(true);
  });
});

const KEEP_TABLES = [
  'CHUNG_KHOAN',
  'CHUYEN_KHOAN_KHAC',
  'CHUYEN_KHOAN_THUA_KE',
  'GIAO_DICH_LUU_KY',
  'LICH_SU_GIA_CK',
  'LOAI_CK',
  'LOAI_GIAO_DICH',
  'NHA_DAU_TU',
  'TAI_KHOAN_LUU_KY',
];

describe('applyStructuredFilter', () => {
  const input = {
    schemaName: 'ADMIN',
    items: [
      { tableName: 'CHUNG_KHOAN', schemaName: 'ADMIN' },
      { tableName: 'RAG_ERROR_LOG', schemaName: 'ADMIN' },
      { tableName: 'NHA_DAU_TU', schemaName: 'ADMIN' },
      { tableName: 'RAG_SCHEMA_VECTORS', schemaName: 'ADMIN' },
    ],
    tables: ['CHUNG_KHOAN', 'RAG_ERROR_LOG', 'NHA_DAU_TU', 'RAG_SCHEMA_VECTORS'],
    count: 4,
    tableCount: 4,
    connection: { type: 'oracle' },
  };

  it('keeps only whitelist tables referenced through items[0]', () => {
    const data = {
      conditions: {
        combinator: 'and',
        conditions: [
          {
            id: '1',
            leftValue: `{{ [${KEEP_TABLES.map((name) => `'${name}'`).join(',')}].includes($json.items[0].tableName) }}`,
            rightValue: '',
            operator: { type: 'boolean', operation: 'true', singleValue: true },
          },
        ],
      },
    };
    const applied = applyStructuredFilter(data, input);
    expect(applied?.pass).toBe(true);
    expect(applied?.output.items).toEqual([
      { tableName: 'CHUNG_KHOAN', schemaName: 'ADMIN' },
      { tableName: 'NHA_DAU_TU', schemaName: 'ADMIN' },
    ]);
    expect(applied?.output.tables).toEqual(['CHUNG_KHOAN', 'NHA_DAU_TU']);
    expect(applied?.output.count).toBe(2);
    expect(applied?.output.tableCount).toBe(2);
    expect(applied?.output.connection).toEqual({ type: 'oracle' });
  });

  it('drops tables whose name contains RAG', () => {
    const data = {
      conditions: {
        combinator: 'and',
        conditions: [
          {
            id: '1',
            leftValue: '{{ $json.items[0].tableName }}',
            rightValue: 'RAG',
            operator: { type: 'string', operation: 'notContains' },
          },
        ],
      },
    };
    const applied = applyStructuredFilter(data, input);
    expect((applied?.output.items as { tableName: string }[]).map((item) => item.tableName)).toEqual([
      'CHUNG_KHOAN',
      'NHA_DAU_TU',
    ]);
  });

  it('treats an unsupported arrow expression as not true', () => {
    const data = {
      conditions: {
        combinator: 'and',
        conditions: [
          {
            id: '1',
            leftValue:
              "{{ $json.items.some(t => ['CHUNG_KHOAN'].includes(t.tableName)) }}",
            rightValue: '',
            operator: { type: 'boolean', operation: 'true', singleValue: true },
          },
        ],
      },
    };
    const applied = applyStructuredFilter(data, input);
    expect(applied?.pass).toBe(false);
    expect(applied?.output.items).toEqual(input.items);
  });
});
