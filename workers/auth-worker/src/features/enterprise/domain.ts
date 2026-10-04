import { z } from 'zod';

import type { BillingEconomics } from '../admin/service/credit';
import {
  addUtcMonths,
  ENTERPRISE_SEAT_GRACE_DAYS,
  grantIncludedWalletPatch,
  periodYm,
  prepaidUsd,
  resolvePlanId,
  type PlanInterval,
} from '../member/workflows/billing/plan';

export type EnterpriseStatus = 'pending' | 'active' | 'suspended';
export type SeatRole = 'business' | 'pro';
export type InvoiceKind = 'period' | 'seat';
export type InvoiceStatus = 'pending' | 'paid' | 'cancelled' | 'expired';

export type EnterpriseRow = {
  id: string;
  name: string;
  min_pro_seats: number;
  status: EnterpriseStatus;
  seat_grace_until: string | null;
  admin_hold: number;
  note: string | null;
  period_end: string | null;
  plan_interval: number | null;
  created_at: string;
  updated_at: string;
};

export type MemberRow = {
  enterprise_id: string;
  user_id: string;
  seat_role: SeatRole;
  created_at: string;
};

export type InvoiceRow = {
  id: string;
  enterprise_id: string;
  payer_user_id: string;
  kind: InvoiceKind;
  plan_interval: number;
  amount_usd: number;
  period_start: string | null;
  period_end: string | null;
  roster_json: string;
  status: InvoiceStatus;
  applied_user_ids: string;
  order_id: string | null;
  created_at: string;
  paid_at: string | null;
};

/** One seat locked on an invoice: who, which plan, what it cost. */
export type RosterSeat = { userId: string; seatRole: SeatRole; unitUsd: number };

export type SeatExclusion = 'self_paid' | 'admin_granted';

export class EnterpriseError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: 400 | 403 | 404 | 409,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'EnterpriseError';
  }
}

const PlanIntervalSchema = z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]);
const UserIdSchema = z.string().trim().min(1).max(320);

export const CreateEnterpriseSchema = z.object({
  name: z.string().trim().min(1).max(200),
  minProSeats: z.number().int().min(0).max(10_000),
  note: z.string().max(2000).optional(),
});

export const PatchEnterpriseSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  minProSeats: z.number().int().min(0).max(10_000).optional(),
  note: z.string().max(2000).nullable().optional(),
  adminHold: z.boolean().optional(),
});

export const AddMemberSchema = z.object({
  userId: UserIdSchema,
  seatRole: z.enum(['business', 'pro']),
});

export const CheckoutSchema = z.object({ interval: PlanIntervalSchema });
export const SeatCheckoutSchema = z.object({ userId: UserIdSchema });

export const RejectFlagRequestSchema = z.object({ reason: z.string().trim().min(1).max(1000) });

export const SetWorkflowFlagSchema = z.object({ isEnterprise: z.boolean(), force: z.boolean().optional() });

export const PENDING_INVOICE_TTL_MS = 24 * 60 * 60 * 1000;
const SEAT_GRACE_MS = ENTERPRISE_SEAT_GRACE_DAYS * 24 * 60 * 60 * 1000;
export const PLAN_INTERVALS_FOR_QUOTE: PlanInterval[] = [1, 3, 6, 12];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseMs(raw: unknown): number {
  const ms = Date.parse(String(raw ?? ''));
  return Number.isFinite(ms) ? ms : Number.NaN;
}

/** Status and grace mark that §2.4 implies for this period end and hold flag. */
export function deriveEnterpriseState(
  org: Pick<EnterpriseRow, 'period_end' | 'admin_hold'>,
  now: Date,
): { status: EnterpriseStatus; seatGraceUntil: string | null } {
  const endMs = parseMs(org.period_end);
  if (!Number.isFinite(endMs)) return { status: 'pending', seatGraceUntil: null };
  const graceUntilMs = endMs + SEAT_GRACE_MS;
  const seatGraceUntil = now.getTime() >= endMs ? new Date(graceUntilMs).toISOString() : null;
  if (now.getTime() >= graceUntilMs) return { status: 'suspended', seatGraceUntil };
  if (org.admin_hold) return { status: 'suspended', seatGraceUntil };
  return { status: 'active', seatGraceUntil };
}

export function seatExclusion(user: Record<string, unknown> | null | undefined): SeatExclusion | null {
  if (!user) return null;
  const source = String(user.planSource ?? user.plan_source ?? '').toLowerCase();
  const status = String(user.planStatus ?? user.plan_status ?? '').toLowerCase();
  if (source === 'paypal' && status === 'active') return 'self_paid';
  if (source === 'admin') return 'admin_granted';
  return null;
}

/** "Đang hiệu lực" in §2.3: the seat plan is live and comes from the organization or an admin grant. */
export function isActiveSeat(user: Record<string, unknown> | null | undefined, seatRole: SeatRole, now: Date): boolean {
  if (!user) return false;
  const source = String(user.planSource ?? user.plan_source ?? '').toLowerCase();
  if (source !== 'enterprise' && source !== 'admin') return false;
  return resolvePlanId(user, now) === seatRole;
}

/** The organization pays this user's plan, so personal checkout and PayPal webhooks must leave it alone. */
export function isEnterpriseManaged(user: Record<string, unknown> | null | undefined, now = new Date()): boolean {
  if (!user) return false;
  const source = String(user.planSource ?? user.plan_source ?? '').toLowerCase();
  return source === 'enterprise' && resolvePlanId(user, now) !== 'free';
}

export const ENTERPRISE_PLAN_MANAGED = { error: 'ENTERPRISE_PLAN_MANAGED', code: 'ENTERPRISE_PLAN_MANAGED' } as const;

export type SeatPrices = Record<SeatRole, number>;

export type PricedRoster = {
  roster: RosterSeat[];
  excluded: Array<{ userId: string; seatRole: SeatRole; reason: SeatExclusion }>;
  billableBusiness: number;
  billablePro: number;
  amountUsd: number;
};

export function priceRoster(
  members: Array<{ userId: string; seatRole: SeatRole; user: Record<string, unknown> | null }>,
  listPerMonth: SeatPrices,
  interval: PlanInterval,
): PricedRoster {
  const roster: RosterSeat[] = [];
  const excluded: PricedRoster['excluded'] = [];
  for (const m of members) {
    const reason = seatExclusion(m.user);
    if (reason) {
      excluded.push({ userId: m.userId, seatRole: m.seatRole, reason });
      continue;
    }
    roster.push({ userId: m.userId, seatRole: m.seatRole, unitUsd: prepaidUsd(listPerMonth[m.seatRole], interval) });
  }
  return {
    roster,
    excluded,
    billableBusiness: roster.filter((s) => s.seatRole === 'business').length,
    billablePro: roster.filter((s) => s.seatRole === 'pro').length,
    amountUsd: round2(roster.reduce((sum, s) => sum + s.unitUsd, 0)),
  };
}

export function meetsSeatThreshold(priced: Pick<PricedRoster, 'billableBusiness' | 'billablePro'>, minProSeats: number): boolean {
  return priced.billableBusiness >= 1 && priced.billablePro >= minProSeats;
}

/** §2.5: at most one period may be queued ahead of now. */
export function assertCanPrepay(currentEnd: string | null, interval: PlanInterval, now: Date): void {
  const endMs = parseMs(currentEnd);
  if (Number.isFinite(endMs) && endMs > addUtcMonths(now, interval).getTime()) {
    throw new EnterpriseError('ALREADY_PREPAID', 409);
  }
}

export function nextPeriodEnd(currentEnd: string | null, interval: PlanInterval, now: Date): { start: Date; end: Date } {
  const endMs = parseMs(currentEnd);
  const start = Number.isFinite(endMs) && endMs > now.getTime() ? new Date(endMs) : now;
  return { start, end: addUtcMonths(start, interval) };
}

export function prorateSeatUsd(listPerMonth: number, interval: PlanInterval, now: Date, periodEnd: Date): number {
  let total = 0;
  let cursorEnd = periodEnd;
  while (cursorEnd.getTime() > now.getTime()) {
    const cursorStart = addUtcMonths(cursorEnd, -interval);
    const segmentMs = cursorEnd.getTime() - cursorStart.getTime();
    const usedMs = cursorEnd.getTime() - Math.max(cursorStart.getTime(), now.getTime());
    total += prepaidUsd(listPerMonth, interval) * (usedMs / segmentMs);
    cursorEnd = cursorStart;
  }
  return round2(total);
}

/**
 * Plan columns written on a seat's UserDO at capture. Included credits are granted once per UTC month
 * per plan, so a renewal inside the same month does not top the wallet up twice.
 */
export function enterpriseSeatPatch(
  user: Record<string, unknown>,
  seatRole: SeatRole,
  periodEnd: string,
  interval: PlanInterval,
  eco: BillingEconomics,
  now: Date,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    planId: seatRole,
    planSource: 'enterprise',
    planStatus: 'active',
    planInterval: interval,
    planCurrentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: false,
    pendingPlanId: null,
  };
  const grantedYm = String(user.planPeriodYm ?? user.plan_period_ym ?? '');
  const grantedPlan = String(user.planIncludedGrantPlanId ?? user.plan_included_grant_plan_id ?? '');
  if (grantedYm === periodYm(now) && grantedPlan === seatRole) return base;
  return { ...base, ...grantIncludedWalletPatch({ ...user, ...base }, seatRole, eco, now) };
}

/** True when the seat already runs to this period end or later, so a retried capture must not move it back. */
export function seatAlreadyCovers(user: Record<string, unknown>, periodEnd: string): boolean {
  const source = String(user.planSource ?? user.plan_source ?? '').toLowerCase();
  if (source !== 'enterprise') return false;
  const current = parseMs(user.planCurrentPeriodEnd ?? user.plan_current_period_end);
  return Number.isFinite(current) && current >= parseMs(periodEnd);
}

const ENTERPRISE_NOTE = /^enterprise:([0-9a-f-]{36})$/i;

export function encodeEnterpriseOrderNotes(invoiceId: string): string {
  return `enterprise:${invoiceId}`;
}

export function parseEnterpriseInvoiceId(order: { notes?: unknown }): string | null {
  const m = ENTERPRISE_NOTE.exec(String(order.notes ?? '').trim());
  return m ? m[1].toLowerCase() : null;
}

export function parseRoster(raw: string): RosterSeat[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RosterSeat[]) : [];
  } catch {
    return [];
  }
}

export function parseAppliedIds(raw: string): Set<string> {
  try {
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

export function toPlanInterval(raw: unknown): PlanInterval {
  const n = Number(raw);
  return n === 3 || n === 6 || n === 12 ? n : 1;
}
