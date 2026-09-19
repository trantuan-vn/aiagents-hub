import { createLogger } from '../../../shared/logger';
import {
  PAYPAL_PLAN_ENV_KEYS,
  mapPaypalPlanId,
  paypalBillingPlanMatrix,
  paypalPlanIdFor,
  type PaypalBillingPlanSpec,
} from '../workflows/billing/catalog';
import { getPaypalApiBase, getPaypalCredentials } from './config';

const log = createLogger('auth-worker', 'paypal-catalog');

export const PAYPAL_PLANS_KV_KEY = 'billing:paypal_plans';
export const PAYPAL_WEBHOOK_KV_KEY = 'billing:paypal_webhook_id';

const DEFAULT_WEBHOOK_URL = 'https://api.aiagents-hub.vn/dashboard/paypal/webhook';
const WEBHOOK_EVENTS = [
  'BILLING.SUBSCRIPTION.CREATED',
  'BILLING.SUBSCRIPTION.ACTIVATED',
  'BILLING.SUBSCRIPTION.UPDATED',
  'BILLING.SUBSCRIPTION.CANCELLED',
  'BILLING.SUBSCRIPTION.SUSPENDED',
  'BILLING.SUBSCRIPTION.EXPIRED',
  'BILLING.SUBSCRIPTION.PAYMENT.FAILED',
  'PAYMENT.SALE.COMPLETED',
];

export type PaypalPlanMap = Record<string, string>;

function envRecord(env: Env): Record<string, unknown> {
  return env as unknown as Record<string, unknown>;
}

function money(n: number): string {
  return n.toFixed(2);
}

export async function loadPaypalPlanMap(env: Env): Promise<PaypalPlanMap> {
  const stored = await readJsonMap(env.SYSTEM_CONFIG_KV, PAYPAL_PLANS_KV_KEY);
  const merged: PaypalPlanMap = { ...stored };
  for (const spec of paypalBillingPlanMatrix()) {
    const fromEnv = paypalPlanIdFor(spec.planId, spec.interval, envRecord(env));
    if (fromEnv) merged[spec.envKey] = fromEnv;
  }
  return merged;
}

export function planIdFromMap(
  planId: 'starter' | 'pro' | 'business',
  interval: 1 | 3 | 6 | 12,
  map: PaypalPlanMap,
  env?: Record<string, unknown>,
): string {
  return paypalPlanIdFor(planId, interval, env) || String(map[PAYPAL_PLAN_ENV_KEYS[planId][interval]] ?? '').trim();
}

export function mapPaypalPlanIdWithMap(
  paypalPlanId: string,
  map: PaypalPlanMap,
  env?: Record<string, unknown>,
): ReturnType<typeof mapPaypalPlanId> {
  const wanted = paypalPlanId.trim();
  if (!wanted) return null;
  const envHit = mapPaypalPlanId(wanted, env);
  if (envHit) return envHit;
  for (const spec of paypalBillingPlanMatrix()) {
    if (map[spec.envKey] === wanted) return { planId: spec.planId, interval: spec.interval };
  }
  return null;
}

export async function resolvePaypalWebhookId(env: Env): Promise<string> {
  const fromEnv =
    String((env as unknown as { PAYPAL_WEBHOOK_ID?: string }).PAYPAL_WEBHOOK_ID ?? process.env.PAYPAL_WEBHOOK_ID ?? '').trim();
  if (fromEnv) return fromEnv;
  const fromKv = await env.SYSTEM_CONFIG_KV?.get(PAYPAL_WEBHOOK_KV_KEY);
  return String(fromKv ?? '').trim();
}

function webhookUrlFromEnv(env: Env): string {
  const base = String((env as unknown as { BASE_URL?: string }).BASE_URL ?? process.env.BASE_URL ?? '').trim();
  if (!base) return DEFAULT_WEBHOOK_URL;
  return `${base.replace(/\/$/, '')}/dashboard/paypal/webhook`;
}

export async function ensurePaypalCatalog(env: Env): Promise<PaypalPlanMap> {
  let map = await loadPaypalPlanMap(env);
  const missing = paypalBillingPlanMatrix().filter((spec) => !String(map[spec.envKey] ?? '').trim());
  const webhookId = await resolvePaypalWebhookId(env);
  if (!missing.length && webhookId) return map;

  const token = await paypalAccessToken(env);
  if (missing.length) {
    const productIds: Record<string, string> = {};
    await Promise.all(
      (['starter', 'pro', 'business'] as const).map(async (planId) => {
        productIds[planId] = await ensureProduct(token, planId);
      }),
    );
    const created = await Promise.all(
      missing.map(async (spec) => {
        const productId = productIds[spec.planId];
        if (!productId) throw new Error(`PayPal product missing for ${spec.planId}`);
        return [spec.envKey, await ensurePlan(token, productId, spec)] as const;
      }),
    );
    for (const [key, id] of created) map[key] = id;
    await env.SYSTEM_CONFIG_KV?.put(PAYPAL_PLANS_KV_KEY, JSON.stringify(map));
  }
  if (!webhookId) {
    const id = await ensureWebhook(token, webhookUrlFromEnv(env));
    await env.SYSTEM_CONFIG_KV?.put(PAYPAL_WEBHOOK_KV_KEY, id);
  }
  return loadPaypalPlanMap(env);
}

async function readJsonMap(kv: KVNamespace | undefined, key: string): Promise<PaypalPlanMap> {
  if (!kv) return {};
  try {
    const raw = await kv.get(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: PaypalPlanMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) out[k] = v.trim();
    }
    return out;
  } catch {
    return {};
  }
}

async function paypalAccessToken(env: Env): Promise<string> {
  const { clientId, clientSecret } = await getPaypalCredentials(env);
  const res = await fetch(`${getPaypalApiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    log.error('paypal.catalog.auth_failed', { status: res.status });
    throw new Error('Failed to authenticate with PayPal');
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error('Failed to authenticate with PayPal');
  return json.access_token;
}

async function paypalJson(
  token: string,
  method: string,
  path: string,
  body?: unknown,
  requestId?: string,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${getPaypalApiBase()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(requestId ? { 'PayPal-Request-Id': requestId } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, json };
}

async function ensureProduct(token: string, planId: string): Promise<string> {
  const id = `AIAGENTS-HUB-${planId.toUpperCase()}`;
  const existing = await paypalJson(token, 'GET', `/v1/catalogs/products/${encodeURIComponent(id)}`);
  if (existing.ok && typeof existing.json.id === 'string') return existing.json.id;
  const created = await paypalJson(
    token,
    'POST',
    '/v1/catalogs/products',
    {
      id,
      name: `AI Agents Hub ${planId[0]?.toUpperCase()}${planId.slice(1)}`,
      description: `Workspace plan ${planId}`,
      type: 'SERVICE',
      category: 'SOFTWARE',
      home_url: 'https://aiagents-hub.vn/packages',
    },
    `hub-product-${planId}`,
  );
  if (created.ok && typeof created.json.id === 'string') return created.json.id;
  const listed = await paypalJson(token, 'GET', '/v1/catalogs/products?page_size=20&page=1');
  const products = Array.isArray(listed.json.products) ? listed.json.products : [];
  const hit = products.find((row) => {
    if (!row || typeof row !== 'object') return false;
    const p = row as { id?: string; name?: string };
    return p.id === id || String(p.name ?? '').toLowerCase().includes(planId);
  }) as { id?: string } | undefined;
  if (hit?.id) return hit.id;
  log.error('paypal.catalog.product_failed', { planId, status: created.status, json: created.json });
  throw new Error('Failed to create PayPal catalog product');
}

async function ensurePlan(token: string, productId: string, spec: PaypalBillingPlanSpec): Promise<string> {
  const listed = await paypalJson(
    token,
    'GET',
    `/v1/billing/plans?product_id=${encodeURIComponent(productId)}&page_size=20&page=1`,
  );
  const plans = Array.isArray(listed.json.plans) ? listed.json.plans : [];
  const found = plans.find((row) => {
    if (!row || typeof row !== 'object') return false;
    const p = row as { name?: string; description?: string; id?: string };
    return p.name === spec.name || String(p.description ?? '').includes(`planId=${spec.planId};planInterval=${spec.interval}`);
  }) as { id?: string; status?: string } | undefined;
  if (found?.id) {
    if (String(found.status ?? '').toUpperCase() === 'CREATED') {
      await paypalJson(token, 'POST', `/v1/billing/plans/${encodeURIComponent(found.id)}/activate`);
    }
    return found.id;
  }
  const created = await paypalJson(
    token,
    'POST',
    '/v1/billing/plans',
    {
      product_id: productId,
      name: spec.name,
      description: `planId=${spec.planId};planInterval=${spec.interval}`,
      status: 'ACTIVE',
      billing_cycles: [
        {
          frequency: { interval_unit: 'MONTH', interval_count: spec.interval },
          tenure_type: 'REGULAR',
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: { fixed_price: { value: money(spec.chargeUsd), currency_code: 'USD' } },
        },
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee: { value: '0', currency_code: 'USD' },
        setup_fee_failure_action: 'CONTINUE',
        payment_failure_threshold: 3,
      },
    },
    `hub-plan-${spec.planId}-${spec.interval}`,
  );
  const id = typeof created.json.id === 'string' ? created.json.id : '';
  if (!created.ok || !id) {
    log.error('paypal.catalog.plan_failed', { envKey: spec.envKey, status: created.status, json: created.json });
    throw new Error('Failed to create PayPal billing plan');
  }
  if (String(created.json.status ?? '').toUpperCase() === 'CREATED') {
    await paypalJson(token, 'POST', `/v1/billing/plans/${encodeURIComponent(id)}/activate`);
  }
  return id;
}

async function ensureWebhook(token: string, url: string): Promise<string> {
  const listed = await paypalJson(token, 'GET', '/v1/notifications/webhooks');
  const webhooks = Array.isArray(listed.json.webhooks) ? listed.json.webhooks : [];
  const existing = webhooks.find((row) => {
    if (!row || typeof row !== 'object') return false;
    return (row as { url?: string }).url === url;
  }) as { id?: string } | undefined;
  if (existing?.id) return existing.id;
  const created = await paypalJson(token, 'POST', '/v1/notifications/webhooks', {
    url,
    event_types: WEBHOOK_EVENTS.map((name) => ({ name })),
  });
  const id = typeof created.json.id === 'string' ? created.json.id : '';
  if (!created.ok || !id) {
    log.error('paypal.catalog.webhook_failed', { status: created.status, json: created.json });
    throw new Error('Failed to create PayPal webhook');
  }
  return id;
}
