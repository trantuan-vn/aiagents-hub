import { describe, expect, it } from 'vitest';

import { resolveHttpRedirect } from './node-runtime.js';

describe('resolveHttpRedirect', () => {
  it('follows a public hop and blocks a private hop', () => {
    expect(resolveHttpRedirect('https://api.aiagents-hub.vn/public/plans', 'https://api.aiagents-hub.vn/v2/plans').href).toBe(
      'https://api.aiagents-hub.vn/v2/plans',
    );
    expect(() => resolveHttpRedirect('https://example.com/start', 'http://169.254.169.254/latest')).toThrow(/Blocked host/);
    expect(() => resolveHttpRedirect('https://example.com/start', 'http://127.0.0.1/admin')).toThrow(/Blocked host/);
  });
});
