import { describe, expect, it } from 'vitest';

import { executeReadOnly } from './oracle-client.js';

describe('executeReadOnly', () => {
  it('is a placeholder until check-sql', async () => {
    await expect(executeReadOnly()).rejects.toThrow(/not implemented/);
  });
});
