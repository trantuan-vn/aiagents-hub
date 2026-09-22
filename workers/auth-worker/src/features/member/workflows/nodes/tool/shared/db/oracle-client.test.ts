import { describe, expect, it } from 'vitest';

import { executeReadOnly } from './oracle-client.js';

describe('executeReadOnly', () => {
  it('requires ORACLE_PROXY_URL on Cloudflare Workers', async () => {
    const g = globalThis as { Cloudflare?: unknown };
    const prev = g.Cloudflare;
    g.Cloudflare = {};
    try {
      await expect(
        executeReadOnly({
          config: { user: 'u', password: 'p', connectString: 'localhost/XEPDB1' },
          sql: 'SELECT 1 FROM dual',
          env: {},
        }),
      ).rejects.toThrow(/ORACLE_PROXY_URL/);
    } finally {
      if (prev === undefined) delete g.Cloudflare;
      else g.Cloudflare = prev;
    }
  });
});
