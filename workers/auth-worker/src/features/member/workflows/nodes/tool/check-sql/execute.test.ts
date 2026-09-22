import { describe, expect, it, vi } from 'vitest';

import { executeCheckSql, guardReadOnlySql } from './execute.js';

const executeReadOnlyMock = vi.hoisted(() => vi.fn());

vi.mock('../shared/db/oracle-client.js', () => ({
  executeReadOnly: executeReadOnlyMock,
}));

describe('guardReadOnlySql', () => {
  it('accepts SELECT and WITH', () => {
    expect(guardReadOnlySql('SELECT 1 FROM dual').ok).toBe(true);
    expect(guardReadOnlySql('WITH x AS (SELECT 1 AS n FROM dual) SELECT * FROM x').ok).toBe(true);
  });

  it('rejects DELETE before any Oracle call', () => {
    const out = guardReadOnlySql('DELETE FROM ADMIN.ORDERS');
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/SELECT|WITH|not allowed/i);
  });

  it('rejects multiple statements and empty SQL', () => {
    expect(guardReadOnlySql('').ok).toBe(false);
    expect(guardReadOnlySql('SELECT 1 FROM dual; SELECT 2 FROM dual').ok).toBe(false);
  });
});

describe('executeCheckSql', () => {
  it('returns ok:true for a valid probe result', async () => {
    executeReadOnlyMock.mockResolvedValueOnce({
      ok: true,
      columns: ['N'],
      rowCount: 1,
      sampleRows: [{ N: 1 }],
      elapsedMs: 12,
    });
    const out = await executeCheckSql({
      env: {} as Env,
      sql: 'SELECT 1 AS n FROM dual',
      config: { user: 'u', password: 'p', connectString: 'c' },
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.sql).toMatch(/^SELECT/i);
      expect(out.columns).toEqual(['N']);
      expect(out.sampleRows).toHaveLength(1);
    }
    expect(executeReadOnlyMock).toHaveBeenCalled();
  });

  it('returns ok:false with ORA code and does not throw', async () => {
    executeReadOnlyMock.mockResolvedValueOnce({
      ok: false,
      error: 'ORA-00904: "NOPE": invalid identifier',
      oracleCode: 'ORA-00904',
    });
    const out = await executeCheckSql({
      env: {} as Env,
      sql: 'SELECT nope FROM dual',
      config: { user: 'u', password: 'p', connectString: 'c' },
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.oracleCode).toBe('ORA-00904');
      expect(out.error).toContain('ORA-00904');
    }
  });

  it('never calls Oracle for DELETE', async () => {
    executeReadOnlyMock.mockClear();
    const out = await executeCheckSql({
      env: {} as Env,
      sql: 'DELETE FROM ADMIN.ORDERS WHERE 1=1',
      config: { user: 'u', password: 'p', connectString: 'c' },
    });
    expect(out.ok).toBe(false);
    expect(executeReadOnlyMock).not.toHaveBeenCalled();
  });
});
