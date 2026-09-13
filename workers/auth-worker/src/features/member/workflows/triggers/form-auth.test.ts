import { describe, expect, it } from 'vitest';

import { normalizeFormAuth } from './form-auth.js';

describe('normalizeFormAuth', () => {
  it('maps n8n aliases onto hub basic / user auth', () => {
    expect(normalizeFormAuth('basic')).toBe('basic');
    expect(normalizeFormAuth('basicAuth')).toBe('basic');
    expect(normalizeFormAuth('hub_users')).toBe('hub_users');
    expect(normalizeFormAuth('n8nUserAuth')).toBe('hub_users');
    expect(normalizeFormAuth('header')).toBe('hub_users');
  });

  it('defaults unknown values to none', () => {
    expect(normalizeFormAuth(undefined)).toBe('none');
    expect(normalizeFormAuth('none')).toBe('none');
    expect(normalizeFormAuth('bearer')).toBe('none');
  });
});
