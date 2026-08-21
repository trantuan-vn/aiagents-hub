import { describe, expect, it, vi } from 'vitest';

import { sendViaPlatformEmail } from './platform-email.js';

describe('platform email', () => {
  it('posts transactional mail through Brevo from noreply@', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messageId: 'msg-1' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendViaPlatformEmail(
      {
        FRONTEND_URL: 'https://aiagents-hub.vn',
        BREVO_API_KEY: { get: async () => 'brevo-key' },
      } as unknown as Env,
      {
        to: 'reviewer@example.com',
        subject: 'Need approval',
        text: 'Please approve',
      },
    );

    expect(result.messageId).toBe('msg-1');
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      sender: { email: 'noreply@aiagents-hub.vn', name: 'aiagents-hub' },
      to: [{ email: 'reviewer@example.com' }],
      subject: 'Need approval',
    });
    vi.unstubAllGlobals();
  });
});
