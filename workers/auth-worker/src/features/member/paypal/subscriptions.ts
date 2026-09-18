import { z } from 'zod';

import { createLogger } from '../../../shared/logger';
import { executeUtils } from '../../../shared/utils';
import { UserDO } from '../../ws/infrastructure/UserDO';
import {
  parsePlanId,
  parsePlanInterval,
  periodYm,
  type PlanId,
  type PlanInterval,
} from '../workflows/billing/plan';
import { isPaypalBillingEnabled, mapPaypalPlanId, paypalPlanIdFor } from '../workflows/billing/catalog';
import { getPaypalApiBase, getPaypalCredentials, PAYPAL_ERROR_MESSAGES } from './config';

const log = createLogger('auth-worker', 'paypal-sub');

export const CheckoutSubscriptionSchema = z.object({
  planId: z.enum(['starter', 'pro', 'business']),
  interval: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]).default(1),
  method: z.enum(['subscription', 'order']).optional(),
});

export const CancelSubscriptionSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const SyncSubscriptionSchema = z.object({
  paypalSubscriptionId: z.string().min(1).max(64),
});

export const AutoTopUpSchema = z.object({
  enabled: z.boolean(),
  usd: z.union([z.literal(5), z.literal(20), z.literal(50)]).optional(),
});

export const AdminGrantPlanSchema = z.object({
  planId: z.enum(['free', 'starter', 'pro', 'business']),
  reason: z.string().min(1).max(500),
});

type PaypalLink = { href?: string; rel?: string };
type PaypalSubJson = {
  id?: string;
  status?: string;
  plan_id?: string;
  custom_id?: string;
  subscriber?: { payer_id?: string };
  billing_info?: { next_billing_time?: string };
  links?: PaypalLink[];
};

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
    log.error('paypal.sub.auth_failed', { status: res.status, body: await res.text() });
    throw new Error(PAYPAL_ERROR_MESSAGES.AUTH_FAILED);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error(PAYPAL_ERROR_MESSAGES.AUTH_FAILED);
  return json.access_token;
}

function approvalUrlFrom(json: PaypalSubJson): string | undefined {
  return json.links?.find((l) => l.rel === 'approve' || l.rel === 'payer-action')?.href;
}

function mapPaypalStatus(raw: string | undefined): 'active' | 'approval_pending' | 'past_due' | 'suspended' | 'canceled' | 'none' {
  const s = String(raw ?? '').toUpperCase();
  if (s === 'ACTIVE' || s === 'APPROVED') return 'active';
  if (s === 'APPROVAL_PENDING') return 'approval_pending';
  if (s === 'SUSPENDED') return 'suspended';
  if (s === 'CANCELLED' || s === 'EXPIRED') return 'canceled';
  return 'none';
}

async function loadUserRow(userDO: DurableObjectStub<UserDO>): Promise<Record<string, unknown>> {
  const users = await executeUtils.executeDynamicAction(userDO, 'select', {}, 'users');
  const row = Array.isArray(users) ? users[0] : users;
  if (!row?.id) throw new Error('User profile not found');
  return row as Record<string, unknown>;
}

async function saveUserPatch(userDO: DurableObjectStub<UserDO>, row: Record<string, unknown>, patch: Record<string, unknown>) {
  await executeUtils.executeDynamicAction(
    userDO,
    'update',
    { id: row.id, ...row, ...patch, queueStatus: 'pending' },
    'users',
  );
}

export function subscriptionSnapshot(row: Record<string, unknown>) {
  return {
    planId: parsePlanId(row.planId ?? row.plan_id),
    planSource: String(row.planSource ?? row.plan_source ?? 'free'),
    planInterval: parsePlanInterval(row.planInterval ?? row.plan_interval),
    planStatus: String(row.planStatus ?? row.plan_status ?? 'none'),
    planCurrentPeriodEnd: row.planCurrentPeriodEnd ?? row.plan_current_period_end ?? null,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd === true || row.cancelAtPeriodEnd === 1 || row.cancel_at_period_end === 1,
    pendingPlanId: row.pendingPlanId ?? row.pending_plan_id ?? null,
    paypalSubscriptionId: row.paypalSubscriptionId ?? row.paypal_subscription_id ?? null,
    autoTopUpEnabled: row.autoTopUpEnabled === true || row.autoTopUpEnabled === 1,
    autoTopUpUsd: row.autoTopUpUsd ?? row.auto_top_up_usd ?? null,
    graceCreditsUsedMonth: Number(row.graceCreditsUsedMonth ?? row.grace_credits_used_month ?? 0) || 0,
  };
}

export async function createPaypalCheckout(params: {
  env: Env;
  userDO: DurableObjectStub<UserDO>;
  identifier: string;
  planId: 'starter' | 'pro' | 'business';
  interval: PlanInterval;
  locale?: string;
}): Promise<{ approvalUrl: string; paypalSubscriptionId: string }> {
  if (!isPaypalBillingEnabled(params.env)) {
    throw new Error(PAYPAL_ERROR_MESSAGES.SUBSCRIPTION_DISABLED);
  }
  const paypalPlanId = paypalPlanIdFor(params.planId, params.interval, params.env as unknown as Record<string, unknown>);
  if (!paypalPlanId) throw new Error(PAYPAL_ERROR_MESSAGES.SUBSCRIPTION_PLAN_MISSING);

  const frontend = process.env.FRONTEND_URL || 'https://aiagents-hub.vn';
  const token = await paypalAccessToken(params.env);
  const res = await fetch(`${getPaypalApiBase()}/v1/billing/subscriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      plan_id: paypalPlanId,
      custom_id: params.identifier,
      application_context: {
        brand_name: 'AI Agents Hub',
        locale: params.locale === 'vi' ? 'vi-VN' : 'en-US',
        shipping_preference: 'NO_SHIPPING',
        user_action: 'SUBSCRIBE_NOW',
        return_url: `${frontend}/dashboard/control/billing?subscription=success`,
        cancel_url: `${frontend}/packages?checkout=cancelled`,
      },
    }),
  });
  const json = (await res.json()) as PaypalSubJson;
  if (!res.ok || !json.id) {
    log.error('paypal.sub.create_failed', { status: res.status, json });
    throw new Error(PAYPAL_ERROR_MESSAGES.SUBSCRIPTION_CREATE_FAILED);
  }
  const approvalUrl = approvalUrlFrom(json);
  if (!approvalUrl) throw new Error(PAYPAL_ERROR_MESSAGES.SUBSCRIPTION_CREATE_FAILED);

  const row = await loadUserRow(params.userDO);
  await saveUserPatch(params.userDO, row, {
    paypalSubscriptionId: json.id,
    paypalPlanId,
    planInterval: params.interval,
    planStatus: 'approval_pending',
  });
  return { approvalUrl, paypalSubscriptionId: json.id };
}

export async function applyPaypalSubscriptionToUser(params: {
  env: Env;
  userDO: DurableObjectStub<UserDO>;
  sub: PaypalSubJson;
}): Promise<void> {
  const mapped = mapPaypalPlanId(String(params.sub.plan_id ?? ''), params.env as unknown as Record<string, unknown>);
  const row = await loadUserRow(params.userDO);
  const status = mapPaypalStatus(params.sub.status);
  const periodEnd = params.sub.billing_info?.next_billing_time ?? row.planCurrentPeriodEnd;
  const patch: Record<string, unknown> = {
    paypalSubscriptionId: params.sub.id ?? row.paypalSubscriptionId,
    paypalPayerId: params.sub.subscriber?.payer_id ?? row.paypalPayerId,
    paypalPlanId: params.sub.plan_id ?? row.paypalPlanId,
    planStatus: status,
    planCurrentPeriodEnd: periodEnd,
  };
  if (mapped && (status === 'active' || status === 'approval_pending')) {
    patch.planId = mapped.planId;
    patch.planInterval = mapped.interval;
    patch.planSource = 'paypal';
    if (status === 'active') patch.cancelAtPeriodEnd = false;
  }
  if (status === 'canceled') {
    const end = String(periodEnd ?? '');
    const stillPaid = end && Date.parse(end) > Date.now();
    if (!stillPaid) {
      patch.planId = 'free';
      patch.planSource = 'free';
    }
  }
  await saveUserPatch(params.userDO, row, patch);
}

export async function fetchPaypalSubscription(env: Env, subscriptionId: string): Promise<PaypalSubJson> {
  const token = await paypalAccessToken(env);
  const res = await fetch(`${getPaypalApiBase()}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    log.error('paypal.sub.get_failed', { status: res.status, body: await res.text() });
    throw new Error(PAYPAL_ERROR_MESSAGES.SUBSCRIPTION_NOT_FOUND);
  }
  return (await res.json()) as PaypalSubJson;
}

export async function syncPaypalSubscription(params: {
  env: Env;
  userDO: DurableObjectStub<UserDO>;
  paypalSubscriptionId: string;
}): Promise<Record<string, unknown>> {
  const sub = await fetchPaypalSubscription(params.env, params.paypalSubscriptionId);
  await applyPaypalSubscriptionToUser({ env: params.env, userDO: params.userDO, sub });
  const row = await loadUserRow(params.userDO);
  return subscriptionSnapshot(row);
}

export async function markCancelAtPeriodEnd(params: {
  env: Env;
  userDO: DurableObjectStub<UserDO>;
  reason?: string;
}): Promise<Record<string, unknown>> {
  const row = await loadUserRow(params.userDO);
  const subId = String(row.paypalSubscriptionId ?? '');
  if (!subId) {
    await saveUserPatch(params.userDO, row, { cancelAtPeriodEnd: true });
    return subscriptionSnapshot(await loadUserRow(params.userDO));
  }
  await saveUserPatch(params.userDO, row, { cancelAtPeriodEnd: true });
  await maybeCancelPaypalNow(params.env, params.userDO, params.reason);
  return subscriptionSnapshot(await loadUserRow(params.userDO));
}

async function paypalCancel(env: Env, subscriptionId: string, reason?: string): Promise<void> {
  const token = await paypalAccessToken(env);
  const res = await fetch(`${getPaypalApiBase()}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ reason: (reason ?? 'User cancelled at period end').slice(0, 128) }),
  });
  if (!res.ok && res.status !== 204) {
    log.error('paypal.sub.cancel_failed', { status: res.status, body: await res.text() });
    throw new Error(PAYPAL_ERROR_MESSAGES.SUBSCRIPTION_CANCEL_FAILED);
  }
}

export async function maybeCancelPaypalNow(env: Env, userDO: DurableObjectStub<UserDO>, reason?: string): Promise<void> {
  const row = await loadUserRow(userDO);
  if (!(row.cancelAtPeriodEnd === true || row.cancelAtPeriodEnd === 1)) return;
  const subId = String(row.paypalSubscriptionId ?? '');
  if (!subId) return;
  const end = Date.parse(String(row.planCurrentPeriodEnd ?? ''));
  if (!Number.isFinite(end)) return;
  if (end - Date.now() > 36 * 60 * 60 * 1000) return;
  await paypalCancel(env, subId, reason);
}

export async function resumePaypalSubscription(userDO: DurableObjectStub<UserDO>): Promise<Record<string, unknown>> {
  const row = await loadUserRow(userDO);
  const status = String(row.planStatus ?? '').toLowerCase();
  if (status === 'canceled') {
    throw new Error('Subscription already cancelled on PayPal — subscribe again');
  }
  await saveUserPatch(userDO, row, { cancelAtPeriodEnd: false });
  return subscriptionSnapshot(await loadUserRow(userDO));
}

export async function grantAdminPlan(params: {
  userDO: DurableObjectStub<UserDO>;
  planId: PlanId;
  reason: string;
}): Promise<Record<string, unknown>> {
  const row = await loadUserRow(params.userDO);
  await saveUserPatch(params.userDO, row, {
    planId: params.planId,
    planSource: params.planId === 'free' ? 'free' : 'admin',
    planStatus: params.planId === 'free' ? 'none' : 'active',
    pendingPlanId: null,
    cancelAtPeriodEnd: false,
  });
  log.info('paypal.sub.admin_grant', { planId: params.planId, reason: params.reason, userId: row.id });
  return subscriptionSnapshot(await loadUserRow(params.userDO));
}

export async function verifyPaypalWebhook(env: Env, headers: Headers, event: unknown): Promise<boolean> {
  const webhookId =
    (env as unknown as { PAYPAL_WEBHOOK_ID?: string }).PAYPAL_WEBHOOK_ID || process.env.PAYPAL_WEBHOOK_ID || '';
  if (!webhookId) return false;
  const token = await paypalAccessToken(env);
  const res = await fetch(`${getPaypalApiBase()}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      auth_algo: headers.get('paypal-auth-algo'),
      cert_url: headers.get('paypal-cert-url'),
      transmission_id: headers.get('paypal-transmission-id'),
      transmission_sig: headers.get('paypal-transmission-sig'),
      transmission_time: headers.get('paypal-transmission-time'),
      webhook_id: webhookId,
      webhook_event: event,
    }),
  });
  if (!res.ok) return false;
  const json = (await res.json()) as { verification_status?: string };
  return json.verification_status === 'SUCCESS';
}

export async function rememberPaypalEvent(db: D1Database | undefined, eventId: string, type: string, userId?: string): Promise<boolean> {
  if (!db || !eventId) return true;
  try {
    const existing = await db.prepare(`SELECT id FROM paypal_events WHERE id = ?`).bind(eventId).first<{ id: string }>();
    if (existing) return false;
    await db
      .prepare(`INSERT INTO paypal_events (id, type, user_id, created_at) VALUES (?, ?, ?, ?)`)
      .bind(eventId, type, userId ?? null, new Date().toISOString())
      .run();
    return true;
  } catch (err) {
    log.warn('paypal.sub.event_store_failed', { eventId, err });
    return true;
  }
}

export async function resolveUserDoForPaypalEvent(env: Env, bindingName: string, sub: PaypalSubJson): Promise<DurableObjectStub<UserDO> | null> {
  const binding = env[bindingName as keyof Env] as DurableObjectNamespace | undefined;
  if (!binding) return null;
  const customId = String(sub.custom_id ?? '').trim();
  if (customId && !/^[0-9a-f]{64}$/i.test(customId)) {
    return binding.get(binding.idFromName(customId)) as DurableObjectStub<UserDO>;
  }
  const subId = String(sub.id ?? '').trim();
  if (env.D1DB && subId) {
    try {
      const row = await env.D1DB.prepare(
        `SELECT identifier FROM users WHERE paypalSubscriptionId = ? LIMIT 1`,
      )
        .bind(subId)
        .first<{ identifier?: string }>();
      if (row?.identifier) {
        return binding.get(binding.idFromName(row.identifier)) as DurableObjectStub<UserDO>;
      }
    } catch {
      /* column may not exist yet */
    }
  }
  return null;
}

export async function processPendingCancels(env: Env, bindingName: string): Promise<void> {
  const db = env.D1DB;
  if (!db) return;
  let rows: Array<{ identifier?: string }> = [];
  try {
    const result = await db
      .prepare(
        `SELECT identifier FROM users WHERE cancelAtPeriodEnd = 1 AND paypalSubscriptionId IS NOT NULL LIMIT 50`,
      )
      .all<{ identifier?: string }>();
    rows = result.results ?? [];
  } catch {
    return;
  }
  const binding = env[bindingName as keyof Env] as DurableObjectNamespace;
  for (const row of rows) {
    if (!row.identifier) continue;
    try {
      const userDO = binding.get(binding.idFromName(row.identifier)) as DurableObjectStub<UserDO>;
      await maybeCancelPaypalNow(env, userDO);
    } catch (err) {
      log.warn('paypal.sub.pending_cancel_failed', { identifier: row.identifier, err });
    }
  }
}

export function periodYmNow(): string {
  return periodYm();
}
