import type { UserDO } from '../ws/infrastructure/UserDO';
import { executeUtils } from '../../shared/utils';
import { createLogger } from '../../shared/logger';
import { getBillingEconomicsFromEnv } from '../admin/service/get-billing-economics';
import { getUsdVndRateFromEnv } from '../admin/system-config/get-usd-vnd-rate';
import { convertUsdToVnd } from '../admin/service/pricing';
import { entitlementFor } from '../member/workflows/billing/plan';
import {
  assertCanPrepay,
  encodeEnterpriseOrderNotes,
  enterpriseSeatPatch,
  EnterpriseError,
  meetsSeatThreshold,
  nextPeriodEnd,
  parseAppliedIds,
  parseRoster,
  PENDING_INVOICE_TTL_MS,
  PLAN_INTERVALS_FOR_QUOTE,
  priceRoster,
  prorateSeatUsd,
  seatAlreadyCovers,
  seatExclusion,
  toPlanInterval,
  type EnterpriseRow,
  type InvoiceKind,
  type InvoiceRow,
  type MemberRow,
  type RosterSeat,
  type SeatPrices,
} from './domain';
import {
  d1,
  getInvoice,
  getMembership,
  getPendingInvoice,
  insertEvent,
  listEnterprises,
  listMembers,
  loadUserRow,
  markSeatApplied,
  refreshEnterpriseState,
  requireEnterprise,
  saveUserPatch,
  userDoFor,
} from './store';

const log = createLogger('auth-worker', 'enterprise-billing');

const PAID_FANOUT_RETRY_MS = 7 * 24 * 60 * 60 * 1000;
const UNPAID_RECONCILE_MS = 3 * 24 * 60 * 60 * 1000;

async function seatPrices(env: Env): Promise<SeatPrices> {
  const eco = await getBillingEconomicsFromEnv(env);
  return {
    business: entitlementFor('business', eco).listPriceUsdPerMonth,
    pro: entitlementFor('pro', eco).listPriceUsdPerMonth,
  };
}

async function membersWithUsers(env: Env, members: MemberRow[]) {
  return Promise.all(
    members.map(async (m) => ({
      userId: m.user_id,
      seatRole: m.seat_role,
      user: await loadUserRow(userDoFor(env, m.user_id)),
    })),
  );
}

/** Caller must be a Business seat of an organization. */
export async function requireBusinessCaller(env: Env, identifier: string): Promise<{ org: EnterpriseRow; member: MemberRow }> {
  const db = d1(env);
  const member = await getMembership(db, identifier);
  if (!member) throw new EnterpriseError('ENTERPRISE_NOT_MEMBER', 403);
  if (member.seat_role !== 'business') throw new EnterpriseError('ENTERPRISE_BUSINESS_ONLY', 403);
  const org = await refreshEnterpriseState(db, await requireEnterprise(db, member.enterprise_id), new Date());
  return { org, member };
}

async function setOrderStatus(env: Env, payerId: string, orderId: string | null, status: 'CANCELLED'): Promise<void> {
  if (!orderId) return;
  try {
    const payerDO = userDoFor(env, payerId);
    const rows = await executeUtils.executeDynamicAction(payerDO, 'select', { where: { field: 'id', operator: '=', value: Number(orderId) } }, 'orders');
    const order = Array.isArray(rows) ? rows[0] : rows;
    if (!order || order.status === 'COMPLETED') return;
    await executeUtils.executeDynamicAction(payerDO, 'update', { id: Number(orderId), status, queueStatus: 'pending' }, 'orders');
  } catch (err) {
    log.warn('enterprise.order_status_failed', { payerId, orderId, err });
  }
}

/** Pending invoices older than 24h become `expired`; their order is cancelled so PayPal refuses it. */
export async function expireStaleInvoices(env: Env, now: Date, enterpriseId?: string): Promise<void> {
  const db = d1(env);
  const cutoff = new Date(now.getTime() - PENDING_INVOICE_TTL_MS).toISOString();
  const stmt = enterpriseId
    ? db.prepare(`SELECT * FROM enterprise_invoices WHERE status = 'pending' AND created_at < ? AND enterprise_id = ?`).bind(cutoff, enterpriseId)
    : db.prepare(`SELECT * FROM enterprise_invoices WHERE status = 'pending' AND created_at < ?`).bind(cutoff);
  const { results } = await stmt.all<InvoiceRow>();
  for (const inv of results ?? []) {
    const res = await db.prepare(`UPDATE enterprise_invoices SET status = 'expired' WHERE id = ? AND status = 'pending'`).bind(inv.id).run();
    if (res.meta.changes === 1) await setOrderStatus(env, inv.payer_user_id, inv.order_id, 'CANCELLED');
  }
}

async function createInvoiceWithOrder(
  env: Env,
  params: {
    org: EnterpriseRow;
    payerId: string;
    kind: InvoiceKind;
    interval: number;
    roster: RosterSeat[];
    amountUsd: number;
    now: Date;
  },
): Promise<{ invoiceId: string; orderId: number; amountUsd: number }> {
  const db = d1(env);
  const invoiceId = crypto.randomUUID();
  try {
    await db
      .prepare(
        `INSERT INTO enterprise_invoices (id, enterprise_id, payer_user_id, kind, plan_interval, amount_usd, roster_json, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      )
      .bind(invoiceId, params.org.id, params.payerId, params.kind, params.interval, params.amountUsd, JSON.stringify(params.roster), params.now.toISOString())
      .run();
  } catch (err) {
    if (String(err).includes('UNIQUE')) throw new EnterpriseError('ENTERPRISE_INVOICE_PENDING', 409);
    throw err;
  }

  try {
    const eco = await getBillingEconomicsFromEnv(env);
    const rate = await getUsdVndRateFromEnv(env);
    const order = await executeUtils.executeDynamicAction(
      userDoFor(env, params.payerId),
      'insert',
      {
        orderCode: `ENT_${Date.now().toString().slice(-6)}${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
        subtotalAmount: params.amountUsd,
        discountAmount: 0,
        finalAmount: params.amountUsd,
        currency: 'USD',
        status: 'PENDING',
        notes: encodeEnterpriseOrderNotes(invoiceId),
        payableAmountVnd: Math.round(convertUsdToVnd(params.amountUsd, rate)),
        usdVndRate: rate,
        creditPriceUsd: eco.creditPriceUsd,
        creditedCredits: 0,
      },
      'orders',
    );
    const orderId = Number(order.id);
    await db.prepare(`UPDATE enterprise_invoices SET order_id = ? WHERE id = ?`).bind(String(orderId), invoiceId).run();
    return { invoiceId, orderId, amountUsd: params.amountUsd };
  } catch (err) {
    await db.prepare(`UPDATE enterprise_invoices SET status = 'cancelled' WHERE id = ? AND status = 'pending'`).bind(invoiceId).run();
    throw err;
  }
}

export async function checkoutPeriod(env: Env, identifier: string, interval: 1 | 3 | 6 | 12, now = new Date()) {
  const { org } = await requireBusinessCaller(env, identifier);
  if (org.admin_hold) throw new EnterpriseError('ENTERPRISE_SUSPENDED', 403);
  await expireStaleInvoices(env, now, org.id);
  if (await getPendingInvoice(d1(env), org.id)) throw new EnterpriseError('ENTERPRISE_INVOICE_PENDING', 409);
  assertCanPrepay(org.period_end, interval, now);

  const members = await membersWithUsers(env, await listMembers(d1(env), org.id));
  const priced = priceRoster(members, await seatPrices(env), interval);
  if (!meetsSeatThreshold(priced, org.min_pro_seats)) throw new EnterpriseError('ENTERPRISE_SEAT_THRESHOLD', 403);
  if (!priced.roster.some((s) => s.userId === identifier && s.seatRole === 'business')) {
    throw new EnterpriseError('ENTERPRISE_PAYER_SELF_PAID', 403);
  }
  return createInvoiceWithOrder(env, {
    org,
    payerId: identifier,
    kind: 'period',
    interval,
    roster: priced.roster,
    amountUsd: priced.amountUsd,
    now,
  });
}

export async function checkoutSeat(env: Env, identifier: string, userId: string, now = new Date()) {
  const db = d1(env);
  const { org } = await requireBusinessCaller(env, identifier);
  if (org.admin_hold) throw new EnterpriseError('ENTERPRISE_SUSPENDED', 403);
  const periodEndMs = Date.parse(String(org.period_end ?? ''));
  if (!Number.isFinite(periodEndMs) || periodEndMs <= now.getTime()) throw new EnterpriseError('ENTERPRISE_NO_FUTURE_PERIOD', 403);

  const target = await getMembership(db, userId);
  if (!target || target.enterprise_id !== org.id) throw new EnterpriseError('ENTERPRISE_NOT_MEMBER', 404);
  const user = await loadUserRow(userDoFor(env, userId));
  if (!user) throw new EnterpriseError('USER_NOT_FOUND', 404);
  if (seatExclusion(user)) throw new EnterpriseError('ENTERPRISE_SEAT_SELF_PAID', 403);
  if (seatAlreadyCovers(user, org.period_end as string)) throw new EnterpriseError('ENTERPRISE_SEAT_COVERED', 403);

  await expireStaleInvoices(env, now, org.id);
  if (await getPendingInvoice(db, org.id)) throw new EnterpriseError('ENTERPRISE_INVOICE_PENDING', 409);

  const interval = toPlanInterval(org.plan_interval);
  const prices = await seatPrices(env);
  const amountUsd = prorateSeatUsd(prices[target.seat_role], interval, now, new Date(periodEndMs));
  if (amountUsd <= 0) throw new EnterpriseError('ENTERPRISE_NO_FUTURE_PERIOD', 403);
  return createInvoiceWithOrder(env, {
    org,
    payerId: identifier,
    kind: 'seat',
    interval,
    roster: [{ userId, seatRole: target.seat_role, unitUsd: amountUsd }],
    amountUsd,
    now,
  });
}

export async function cancelInvoice(env: Env, identifier: string, invoiceId: string): Promise<void> {
  const db = d1(env);
  const inv = await getInvoice(db, invoiceId);
  if (!inv || inv.payer_user_id !== identifier) throw new EnterpriseError('INVOICE_NOT_FOUND', 404);
  if (inv.status !== 'pending') throw new EnterpriseError('INVOICE_NOT_PENDING', 409);
  const res = await db.prepare(`UPDATE enterprise_invoices SET status = 'cancelled' WHERE id = ? AND status = 'pending'`).bind(invoiceId).run();
  if (res.meta.changes === 1) await setOrderStatus(env, inv.payer_user_id, inv.order_id, 'CANCELLED');
}

/**
 * Called by a payment path before it completes the order. Rejects an order that does not belong to the
 * invoice, so a hand-made order carrying someone's invoice id cannot settle it.
 */
export async function assertOrderSettlesInvoice(
  env: Env,
  invoiceId: string,
  order: { id: unknown; finalAmount?: unknown; final_amount?: unknown },
  payerIdentifier: unknown,
): Promise<void> {
  const inv = await getInvoice(d1(env), invoiceId);
  const amount = Number(order.finalAmount ?? order.final_amount ?? Number.NaN);
  if (
    !inv ||
    inv.order_id !== String(order.id) ||
    inv.payer_user_id !== String(payerIdentifier ?? '') ||
    Math.round(amount * 100) !== Math.round(inv.amount_usd * 100)
  ) {
    log.error('enterprise.order_invoice_mismatch', { invoiceId, orderId: order.id });
    throw new EnterpriseError('ENTERPRISE_INVOICE_MISMATCH', 400);
  }
}

/**
 * Money already reached us for this invoice. Lock `paid` and the period once, then write each seat's plan
 * on its UserDO. Safe to call again: the period branch runs only for the call that flips the status.
 */
export async function captureEnterpriseInvoice(env: Env, invoiceId: string, now = new Date()): Promise<void> {
  const db = d1(env);
  let inv = await getInvoice(db, invoiceId);
  if (!inv) throw new EnterpriseError('INVOICE_NOT_FOUND', 404);

  if (inv.status !== 'paid') {
    const org = await requireEnterprise(db, inv.enterprise_id);
    const interval = toPlanInterval(inv.plan_interval);
    const period =
      inv.kind === 'period'
        ? nextPeriodEnd(org.period_end, interval, now)
        : { start: now, end: new Date(String(org.period_end ?? '')) };
    if (!Number.isFinite(period.end.getTime())) throw new EnterpriseError('ENTERPRISE_NO_FUTURE_PERIOD', 409);
    const periodEnd = period.end.toISOString();
    const paidAt = now.toISOString();

    const flip = db
      .prepare(
        `UPDATE enterprise_invoices SET status = 'paid', period_start = ?, period_end = ?, paid_at = ? WHERE id = ? AND status != 'paid'`,
      )
      .bind(period.start.toISOString(), periodEnd, paidAt, invoiceId);
    // changes() reads the row count of the invoice UPDATE above, inside the same batch transaction:
    // only the call that flipped the invoice may move the organization's period.
    const extend = db
      .prepare(
        `UPDATE enterprises
            SET period_end = ?, plan_interval = ?, seat_grace_until = NULL,
                status = CASE WHEN admin_hold = 1 THEN 'suspended' ELSE 'active' END, updated_at = ?
          WHERE id = ? AND changes() = 1`,
      )
      .bind(periodEnd, interval, paidAt, org.id);
    const results = await db.batch(inv.kind === 'period' ? [flip, extend] : [flip]);
    if (results[0].meta.changes === 1) {
      await insertEvent(db, {
        enterpriseId: org.id,
        type: 'invoice_paid',
        payload: { invoiceId, kind: inv.kind, amountUsd: inv.amount_usd, periodEnd },
        actorId: inv.payer_user_id,
      });
    }
    inv = (await getInvoice(db, invoiceId)) as InvoiceRow;
  }

  await applyInvoiceSeats(env, inv, now);
}

async function applyInvoiceSeats(env: Env, inv: InvoiceRow, now: Date): Promise<void> {
  const db = d1(env);
  if (!inv.period_end) return;
  const applied = parseAppliedIds(inv.applied_user_ids);
  const eco = await getBillingEconomicsFromEnv(env);
  const interval = toPlanInterval(inv.plan_interval);

  for (const seat of parseRoster(inv.roster_json)) {
    if (applied.has(seat.userId)) continue;
    const membership = await getMembership(db, seat.userId);
    const userDO = userDoFor(env, seat.userId);
    const user = await loadUserRow(userDO);
    let skipped: string | null = null;
    if (!membership || membership.enterprise_id !== inv.enterprise_id) skipped = 'not_member';
    else if (!user) skipped = 'no_profile';
    else skipped = seatExclusion(user);

    if (skipped) {
      await insertEvent(db, {
        enterpriseId: inv.enterprise_id,
        type: 'invoice_seat_skipped',
        payload: { invoiceId: inv.id, userId: seat.userId, reason: skipped },
        actorId: inv.payer_user_id,
      });
    } else if (user && !seatAlreadyCovers(user, inv.period_end)) {
      await saveUserPatch(userDO, user.id, enterpriseSeatPatch(user, seat.seatRole, inv.period_end, interval, eco, now));
    }
    await markSeatApplied(db, inv.id, seat.userId);
  }
}

async function payerHasCompletedPayment(env: Env, inv: InvoiceRow): Promise<boolean> {
  if (!inv.order_id) return false;
  const rows = await executeUtils.executeDynamicAction(
    userDoFor(env, inv.payer_user_id) as DurableObjectStub<UserDO>,
    'select',
    { where: { field: 'orderId', operator: '=', value: Number(inv.order_id) } },
    'payments',
  );
  return (Array.isArray(rows) ? rows : []).some((p: Record<string, unknown>) => String(p.status ?? '').toUpperCase() === 'COMPLETED');
}

/** Hourly: expire stale invoices, finish interrupted capture, settle invoices whose payment landed, persist §2.4 status. */
export async function sweepEnterprises(env: Env, now = new Date()): Promise<void> {
  const db = d1(env);
  await expireStaleInvoices(env, now);

  const paidSince = new Date(now.getTime() - PAID_FANOUT_RETRY_MS).toISOString();
  const { results: unfinished } = await db
    .prepare(
      `SELECT id FROM enterprise_invoices
        WHERE status = 'paid' AND paid_at > ? AND json_array_length(applied_user_ids) < json_array_length(roster_json)`,
    )
    .bind(paidSince)
    .all<{ id: string }>();
  for (const { id } of unfinished ?? []) {
    try {
      await captureEnterpriseInvoice(env, id, now);
    } catch (err) {
      log.warn('enterprise.sweep_fanout_failed', { invoiceId: id, err });
    }
  }

  const createdSince = new Date(now.getTime() - UNPAID_RECONCILE_MS).toISOString();
  const { results: unpaid } = await db
    .prepare(`SELECT * FROM enterprise_invoices WHERE status != 'paid' AND order_id IS NOT NULL AND created_at > ?`)
    .bind(createdSince)
    .all<InvoiceRow>();
  for (const inv of unpaid ?? []) {
    try {
      if (await payerHasCompletedPayment(env, inv)) await captureEnterpriseInvoice(env, inv.id, now);
    } catch (err) {
      log.warn('enterprise.sweep_reconcile_failed', { invoiceId: inv.id, err });
    }
  }

  for (const org of await listEnterprises(db)) {
    await refreshEnterpriseState(db, org, now);
  }
}

export async function billingSnapshot(env: Env, identifier: string, now = new Date()) {
  const db = d1(env);
  const { org } = await requireBusinessCaller(env, identifier);
  await expireStaleInvoices(env, now, org.id);
  const members = await membersWithUsers(env, await listMembers(db, org.id));
  const prices = await seatPrices(env);
  const quotes = Object.fromEntries(
    PLAN_INTERVALS_FOR_QUOTE.map((interval) => [interval, priceRoster(members, prices, interval).amountUsd]),
  );
  const priced = priceRoster(members, prices, 1);
  const pending = await getPendingInvoice(db, org.id);
  return {
    enterprise: {
      id: org.id,
      name: org.name,
      status: org.status,
      periodEnd: org.period_end,
      planInterval: org.plan_interval,
      seatGraceUntil: org.seat_grace_until,
      adminHold: org.admin_hold === 1,
      minProSeats: org.min_pro_seats,
    },
    seats: members.map((m) => ({
      userId: m.userId,
      seatRole: m.seatRole,
      excluded: seatExclusion(m.user),
      planId: m.user?.planId ?? null,
      planSource: m.user?.planSource ?? null,
      planCurrentPeriodEnd: m.user?.planCurrentPeriodEnd ?? null,
    })),
    billableBusiness: priced.billableBusiness,
    billablePro: priced.billablePro,
    thresholdMet: meetsSeatThreshold(priced, org.min_pro_seats),
    quotes,
    pendingInvoice: pending
      ? {
          id: pending.id,
          kind: pending.kind,
          amountUsd: pending.amount_usd,
          orderId: pending.order_id ? Number(pending.order_id) : null,
          payerUserId: pending.payer_user_id,
          createdAt: pending.created_at,
        }
      : null,
  };
}
