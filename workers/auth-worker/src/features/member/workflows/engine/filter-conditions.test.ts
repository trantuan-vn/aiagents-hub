import { describe, expect, it } from 'vitest';

import {
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
