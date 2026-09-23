import { describe, expect, it, vi } from 'vitest';

import { executeCheckSql, guardReadOnlySql } from './execute.js';

const validateReadOnlyMock = vi.hoisted(() => vi.fn());

vi.mock('../shared/db/oracle-client.js', () => ({
  validateReadOnly: validateReadOnlyMock,
  executeReadOnly: vi.fn(),
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
  it('returns ok:true for a valid validate-only result', async () => {
    validateReadOnlyMock.mockResolvedValueOnce({
      ok: true,
      columns: [],
      rowCount: 0,
      sampleRows: [],
      elapsedMs: 12,
      validatedOnly: true,
    });
    const out = await executeCheckSql({
      env: {} as Env,
      sql: 'SELECT 1 AS n FROM dual',
      config: { user: 'u', password: 'p', connectString: 'c' },
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.sql).toMatch(/^SELECT/i);
      expect(out.validatedOnly).toBe(true);
    }
    expect(validateReadOnlyMock).toHaveBeenCalled();
  });

  it('returns ok:false with ORA code and does not throw', async () => {
    validateReadOnlyMock.mockResolvedValueOnce({
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
    validateReadOnlyMock.mockClear();
    const out = await executeCheckSql({
      env: {} as Env,
      sql: 'DELETE FROM ADMIN.ORDERS WHERE 1=1',
      config: { user: 'u', password: 'p', connectString: 'c' },
    });
    expect(out.ok).toBe(false);
    expect(validateReadOnlyMock).not.toHaveBeenCalled();
  });

  it('resolves connection and schema from toolConfig expression fields', async () => {
    validateReadOnlyMock.mockResolvedValueOnce({
      ok: true,
      columns: [],
      rowCount: 0,
      sampleRows: [],
      elapsedMs: 1,
      validatedOnly: true,
    });
    const out = await executeCheckSql({
      env: {} as Env,
      sql: 'SELECT 1 FROM dual',
      triggerContext: { u: 'alice', p: 'secret', c: 'db.host/XEPDB1', schemaName: 'ADMIN' },
      toolConfig: {
        userField: '{{ $json.u }}',
        passwordField: '{{ $json.p }}',
        connectStringField: '{{ $json.c }}',
        schemaNameField: '{{ $json.schemaName }}',
      },
    });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.schemaName).toBe('ADMIN');
    expect(validateReadOnlyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          user: 'alice',
          password: 'secret',
          connectString: 'db.host/XEPDB1',
        }),
        schemaName: 'ADMIN',
      }),
    );
  });

  it('resolves form shorthand u/p/c/s for SELECT * FROM ADMIN.CHUNG_KHOAN', async () => {
    validateReadOnlyMock.mockResolvedValueOnce({
      ok: true,
      columns: [],
      rowCount: 0,
      sampleRows: [],
      elapsedMs: 8,
      validatedOnly: true,
    });
    const connectString =
      '(description= (retry_count=20)(retry_delay=3)(address=(protocol=tcps)(port=1522)(host=adb.ap-singapore-1.oraclecloud.com))(connect_data=(service_name=g3d495d60e13477_host10_high.adb.oraclecloud.com))(security=(ssl_server_dn_match=yes)))';
    const out = await executeCheckSql({
      env: {} as Env,
      sql: 'SELECT * FROM ADMIN.CHUNG_KHOAN',
      triggerContext: {
        u: 'ADMIN',
        p: 'secret',
        c: connectString,
        s: 'ADMIN',
      },
      toolConfig: {},
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.sql).toBe('SELECT * FROM ADMIN.CHUNG_KHOAN');
      expect(out.schemaName).toBe('ADMIN');
      expect(out.validatedOnly).toBe(true);
    }
    expect(validateReadOnlyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          user: 'ADMIN',
          password: 'secret',
          connectString,
        }),
        schemaName: 'ADMIN',
        sql: 'SELECT * FROM ADMIN.CHUNG_KHOAN',
      }),
    );
  });
});
