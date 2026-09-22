import { describe, expect, it, vi } from 'vitest';

import { resolveOracleConnectConfig, resolveOracleSchema } from './connect-config.js';

const CONNECT_STRING =
  '(description= (retry_count=20)(retry_delay=3)(address=(protocol=tcps)(port=1522)(host=adb.ap-singapore-1.oraclecloud.com))(connect_data=(service_name=g3d495d60e13477_host10_high.adb.oraclecloud.com))(security=(ssl_server_dn_match=yes)))';

describe('resolveOracleConnectConfig', () => {
  it('reads user, password, and connectString from a previous form node', () => {
    const config = resolveOracleConnectConfig({
      fields: { user: 'ADMIN', password: 'secret', connectString: CONNECT_STRING },
      user: 'ADMIN',
      password: 'secret',
      connectString: CONNECT_STRING,
    });
    expect(config).toEqual({
      user: 'ADMIN',
      password: 'secret',
      connectString: CONNECT_STRING,
    });
  });

  it('reads credentials from HTTP node data', () => {
    const config = resolveOracleConnectConfig({
      status: 200,
      ok: true,
      data: {
        USER: 'ADMIN',
        PASSWORD: 'secret',
        connectString: CONNECT_STRING,
      },
    });
    expect(config?.user).toBe('ADMIN');
    expect(config?.password).toBe('secret');
    expect(config?.connectString).toBe(CONNECT_STRING);
  });

  it('returns null when the connect string is missing', () => {
    expect(resolveOracleConnectConfig({ user: 'ADMIN', password: 'secret' })).toBeNull();
  });

  it('reads form shorthand u, p, c from the previous node', () => {
    const config = resolveOracleConnectConfig({
      triggerKind: 'form',
      fields: { u: 'ADMIN', p: 'secret', c: CONNECT_STRING },
      u: 'ADMIN',
      p: 'secret',
      c: CONNECT_STRING,
    });
    expect(config).toEqual({
      user: 'ADMIN',
      password: 'secret',
      connectString: CONNECT_STRING,
    });
  });
});

describe('resolveOracleSchema', () => {
  it('uses the Oracle user when schema is public', () => {
    expect(resolveOracleSchema('public', 'admin')).toBe('ADMIN');
  });
});
