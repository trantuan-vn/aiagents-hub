import { describe, expect, it } from 'vitest';

import { buildChatCorsHeaders } from './chat-cors.js';

describe('buildChatCorsHeaders', () => {
  it('does not echo an unknown origin when the node allows every origin', () => {
    const headers = buildChatCorsHeaders('https://evil.example', '*');
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
    expect(headers['Access-Control-Allow-Credentials']).toBe('false');
  });

  it('allows the public support site', () => {
    const headers = buildChatCorsHeaders('https://aiagents-hub.vn', '*');
    expect(headers['Access-Control-Allow-Origin']).toBe('https://aiagents-hub.vn');
    expect(headers['Access-Control-Allow-Credentials']).toBe('true');
  });

  it('echoes only an origin the node listed', () => {
    const headers = buildChatCorsHeaders('https://docs.customer.test', 'https://docs.customer.test');
    expect(headers['Access-Control-Allow-Origin']).toBe('https://docs.customer.test');
    const other = buildChatCorsHeaders('https://evil.example', 'https://docs.customer.test');
    expect(other['Access-Control-Allow-Origin']).toBeUndefined();
  });
});
