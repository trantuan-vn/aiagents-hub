import { afterEach, describe, expect, it, vi } from 'vitest';

import { runHttpRequest } from './node-runtime.js';

describe('local API short-circuit', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('serves GET /public/plans in-process so a Durable Object does not fetch its own host', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
    const result = await runHttpRequest(
      { method: 'GET', url: 'https://api.aiagents-hub.vn/public/plans' },
      {},
      null,
      { PAYPAL_BILLING_ENABLED: 'false' },
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    const body = result.data as {
      billingEnabled: boolean;
      plans: Array<{ planId: string; listPriceUsdPerMonth: number; includedCredits: number }>;
    };
    expect(body.billingEnabled).toBe(false);
    expect(body.plans.map((plan) => plan.planId)).toEqual(['free', 'starter', 'pro', 'business']);
    expect(body.plans.every((plan) => typeof plan.listPriceUsdPerMonth === 'number')).toBe(true);
    expect(JSON.stringify(body).length).toBeLessThan(4000);
  });

  it('uses BASE_URL when the catalog host is not the production API', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
    const result = await runHttpRequest(
      { method: 'GET', url: 'https://api.staging.example/public/plans/' },
      {},
      null,
      { BASE_URL: 'https://api.staging.example', PAYPAL_BILLING_ENABLED: 'true' },
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it('still fetches /public/plans on another host', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const result = await runHttpRequest({ method: 'GET', url: 'https://example.com/public/plans' }, {}, null);
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(result.status).toBe(200);
  });
});
