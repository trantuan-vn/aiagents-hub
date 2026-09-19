import { z } from 'zod';

import { createLogger } from '../../../shared/logger';
import { executeUtils } from '../../../shared/utils';
import { UserDO } from '../../ws/infrastructure/UserDO';
import {
  addUtcMonths,
  parsePlanInterval,
  periodYm,
  resolvePlanId,
  type PlanId,
  type PlanInterval,
} from '../workflows/billing/plan';
import { isPaypalBillingEnabled } from '../workflows/billing/catalog';
import { getPaypalApiBase, getPaypalCredentials, PAYPAL_ERROR_MESSAGES } from './config';
import { loadPaypalPlanMap, mapPaypalPlanIdWithMap, planIdFromMap, resolvePaypalWebhookId } from './catalog-bootstrap';

const log = createLogger('auth-worker', 'paypal-sub');

export const CheckoutSubscriptionSchema = z.object({
  planId: z.enum(['starter', 'pro', 'business']),
  interval: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]).default(1),
  /** Subscribe is opt-in. Packages upgrade and omitted method create a prepaid order (Casso / one-time PayPal). */
  method: z.enum(['subscription', 'order']).optional(),
  /** Re-open the Casso/PayPal chooser if the user cancels hosted Subscribe. Success returns without payOrder. */
  returnOrderId: z.number().int().positive().optional(),
  /** RFC 3339. Future start skips the first charge until that instant (prepaid → auto-renew). */
  startTime: z.string().min(20).max(40).optional(),
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
export type PaypalSubJson = {
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

export function mapPaypalStatus(
  raw: string | undefined,
): 'active' | 'approval_pending' | 'past_due' | 'suspended' | 'canceled' | 'none' {
  const s = String(raw ?? '').toUpperCase();
  if (s === 'ACTIVE' || s === 'APPROVED') return 'active';
  if (s === 'APPROVAL_PENDING') return 'approval_pending';
  if (s === 'SUSPENDED') return 'suspended';
  if (s === 'CANCELLED' || s === 'EXPIRED') return 'canceled';
  return 'none';
}

export function paypalSubscriptionStubFromWebhook(
  type: string,
  resource: Record<string, unknown>,
): PaypalSubJson {
  if (type.startsWith('BILLING.SUBSCRIPTION') || resource.plan_id) {
    return resource as PaypalSubJson;
  }
  const agreement = resource.billing_agreement_id;
  if (typeof agreement === 'string' && agreement.trim()) {
    return { id: agreement.trim() };
  }
  return resource as PaypalSubJson;
}

export function shouldCreatePaypalSubscription(params: {
  method?: 'subscription' | 'order';
  billingEnabled: boolean;
  paypalPlanId: string;
}): boolean {
  return params.method === 'subscription' && params.billingEnabled && params.paypalPlanId.trim().length > 0;
}

/** Cancel on PayPal this close to next_billing_time so the next cycle is not charged. */
export const PAYPAL_CANCEL_LEAD_MS = 36 * 60 * 60 * 1000;

export function shouldCancelPaypalNow(periodEnd: unknown, now = new Date()): boolean {
  const end = Date.parse(String(periodEnd ?? ''));
  if (!Number.isFinite(end)) return true;
  return now.getTime() + PAYPAL_CANCEL_LEAD_MS >= end;
}

function parseIsoOrEmpty(raw: unknown): string {
  const ms = Date.parse(String(raw ?? ''));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : '';
}

function fallbackPeriodEnd(interval: PlanInterval, now: Date): string {
  return addUtcMonths(now, interval).toISOString();
}

function keepPaidPaypalPatch(
  mapped: { planId: PlanId; interval: PlanInterval } | null,
  periodEnd: string,
): Record<string, unknown> {
  const patch: Record<string, unknown> = { planCurrentPeriodEnd: periodEnd, cancelAtPeriodEnd: true };
  if (mapped) {
    patch.planId = mapped.planId;
    patch.planInterval = mapped.interval;
    patch.planSource = 'paypal';
  }
  return patch;
}

/** Grant the workspace plan only after PayPal reports a paid/active subscription. */
export function subscriptionEntitlementPatch(params: {
  mapped: { planId: PlanId; interval: PlanInterval } | null;
  status: ReturnType<typeof mapPaypalStatus>;
  nextBillingTime?: string;
  existingPeriodEnd?: unknown;
  existingInterval?: PlanInterval;
  now?: Date;
}): Record<string, unknown> {
  const now = params.now ?? new Date();
  const patch: Record<string, unknown> = {};
  if (params.status !== 'none') patch.planStatus = params.status;
  if (params.mapped && params.status === 'active') {
    patch.planId = params.mapped.planId;
    patch.planInterval = params.mapped.interval;
    patch.planSource = 'paypal';
    patch.cancelAtPeriodEnd = false;
    const next = parseIsoOrEmpty(params.nextBillingTime);
    const existing = parseIsoOrEmpty(params.existingPeriodEnd);
    if (next) patch.planCurrentPeriodEnd = next;
    else if (!existing || Date.parse(existing) <= now.getTime()) {
      patch.planCurrentPeriodEnd = fallbackPeriodEnd(params.mapped.interval, now);
    }
  }
  if (params.status === 'canceled') {
    const end = parseIsoOrEmpty(params.nextBillingTime) || parseIsoOrEmpty(params.existingPeriodEnd);
    const endMs = Date.parse(end);
    if (Number.isFinite(endMs) && endMs > now.getTime()) {
      Object.assign(patch, keepPaidPaypalPatch(params.mapped, end));
    } else if (Number.isFinite(endMs)) {
      patch.planId = 'free';
      patch.planSource = 'free';
      patch.cancelAtPeriodEnd = true;
    } else {
      const interval = params.mapped?.interval ?? params.existingInterval ?? 1;
      Object.assign(patch, keepPaidPaypalPatch(params.mapped, fallbackPeriodEnd(interval, now)));
    }
  }
  return patch;
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
    planId: resolvePlanId(row),
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
  startTime?: string;
  returnOrderId?: number;
}): Promise<{ approvalUrl: string; paypalSubscriptionId: string }> {
  if (!isPaypalBillingEnabled(params.env)) {
    throw new Error(PAYPAL_ERROR_MESSAGES.SUBSCRIPTION_DISABLED);
  }
  const planMap = await loadPaypalPlanMap(params.env);
  const paypalPlanId = planIdFromMap(
    params.planId,
    params.interval,
    planMap,
    params.env as unknown as Record<string, unknown>,
  );
  if (!paypalPlanId) throw new Error(PAYPAL_ERROR_MESSAGES.SUBSCRIPTION_PLAN_MISSING);

  const frontend = process.env.FRONTEND_URL || 'https://aiagents-hub.vn';
  const billing = `${frontend}/dashboard/control/billing`;
  const orderQ = params.returnOrderId ? `&payOrder=${params.returnOrderId}` : '';
  const token = await paypalAccessToken(params.env);
  const startMs = params.startTime ? Date.parse(params.startTime) : Number.NaN;
  const startTime =
    Number.isFinite(startMs) && startMs - Date.now() >= 24 * 60 * 60 * 1000
      ? new Date(startMs).toISOString()
      : undefined;
  const row = await loadUserRow(params.userDO);
  const existingId = String(row.paypalSubscriptionId ?? '').trim();
  if (existingId) {
    try {
      await paypalCancel(params.env, existingId, 'Replaced by a new Subscribe');
    } catch (err) {
      log.warn('paypal.sub.replace_cancel_failed', { existingId, err });
    }
  }
  const res = await fetch(`${getPaypalApiBase()}/v1/billing/subscriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      plan_id: paypalPlanId,
      custom_id: params.identifier,
      ...(startTime ? { start_time: startTime } : {}),
      application_context: {
        brand_name: 'AI Agents Hub',
        locale: params.locale === 'vi' ? 'vi-VN' : 'en-US',
        landing_page: 'NO_PREFERENCE',
        shipping_preference: 'NO_SHIPPING',
        user_action: 'SUBSCRIBE_NOW',
        return_url: `${billing}?subscription=success`,
        cancel_url: `${billing}?checkout=cancelled${orderQ}`,
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

  await saveUserPatch(params.userDO, row, {
    paypalSubscriptionId: json.id,
    paypalPlanId,
    planInterval: params.interval,
  });
  return { approvalUrl, paypalSubscriptionId: json.id };
}

export async function applyPaypalSubscriptionToUser(params: {
  env: Env;
  userDO: DurableObjectStub<UserDO>;
  sub: PaypalSubJson;
}): Promise<void> {
  if (params.sub.id && !params.sub.plan_id) {
    try {
      params = { ...params, sub: await fetchPaypalSubscription(params.env, String(params.sub.id)) };
    } catch (err) {
      log.warn('paypal.sub.hydrate_failed', { id: params.sub.id, err });
      return;
    }
  }
  const planMap = await loadPaypalPlanMap(params.env);
  const mapped = mapPaypalPlanIdWithMap(
    String(params.sub.plan_id ?? ''),
    planMap,
    params.env as unknown as Record<string, unknown>,
  );
  const row = await loadUserRow(params.userDO);
  const status = mapPaypalStatus(params.sub.status);
  const patch: Record<string, unknown> = {
    paypalSubscriptionId: params.sub.id ?? row.paypalSubscriptionId,
    paypalPayerId: params.sub.subscriber?.payer_id ?? row.paypalPayerId,
    paypalPlanId: params.sub.plan_id ?? row.paypalPlanId,
    ...subscriptionEntitlementPatch({
      mapped,
      status,
      nextBillingTime: params.sub.billing_info?.next_billing_time,
      existingPeriodEnd: row.planCurrentPeriodEnd ?? row.plan_current_period_end,
      existingInterval: parsePlanInterval(row.planInterval ?? row.plan_interval),
    }),
  };
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

export function paypalCancelHttpAccepted(status: number): boolean {
  return status === 204 || status === 200 || status === 404 || status === 422;
}

export async function markCancelAtPeriodEnd(params: {
  env: Env;
  userDO: DurableObjectStub<UserDO>;
  reason?: string;
}): Promise<Record<string, unknown>> {
  const row = await loadUserRow(params.userDO);
  const subId = String(row.paypalSubscriptionId ?? '').trim();
  const interval = parsePlanInterval(row.planInterval ?? row.plan_interval);
  let periodEnd = parseIsoOrEmpty(row.planCurrentPeriodEnd ?? row.plan_current_period_end);
  if (subId) {
    try {
      const sub = await fetchPaypalSubscription(params.env, subId);
      const next = parseIsoOrEmpty(sub.billing_info?.next_billing_time);
      if (next) periodEnd = next;
    } catch (err) {
      log.warn('paypal.sub.cancel_hydrate_failed', { subId, err });
    }
  }
  if (!periodEnd) periodEnd = fallbackPeriodEnd(interval, new Date());

  const patch: Record<string, unknown> = {
    cancelAtPeriodEnd: true,
    planCurrentPeriodEnd: periodEnd,
  };
  if (subId && shouldCancelPaypalNow(periodEnd)) {
    await paypalCancel(params.env, subId, params.reason);
    patch.planStatus = 'canceled';
  }
  await saveUserPatch(params.userDO, row, patch);
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
  if (!paypalCancelHttpAccepted(res.status)) {
    log.error('paypal.sub.cancel_failed', { status: res.status, body: await res.text() });
    throw new Error(PAYPAL_ERROR_MESSAGES.SUBSCRIPTION_CANCEL_FAILED);
  }
}

export async function maybeCancelPaypalNow(env: Env, userDO: DurableObjectStub<UserDO>, reason?: string): Promise<void> {
  const row = await loadUserRow(userDO);
  if (!(row.cancelAtPeriodEnd === true || row.cancelAtPeriodEnd === 1)) return;
  const subId = String(row.paypalSubscriptionId ?? '').trim();
  if (!subId) return;
  const status = String(row.planStatus ?? row.plan_status ?? '').toLowerCase();
  if (status === 'canceled' || status === 'approval_pending') return;
  if (!shouldCancelPaypalNow(row.planCurrentPeriodEnd ?? row.plan_current_period_end)) return;
  await paypalCancel(env, subId, reason);
  await saveUserPatch(userDO, row, { planStatus: 'canceled', cancelAtPeriodEnd: true });
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
  const webhookId = await resolvePaypalWebhookId(env);
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
