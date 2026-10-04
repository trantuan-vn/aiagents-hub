import type { UserDO } from '../ws/infrastructure/UserDO';
import { executeUtils } from '../../shared/utils';
import {
  deriveEnterpriseState,
  EnterpriseError,
  type EnterpriseRow,
  type InvoiceRow,
  type MemberRow,
} from './domain';

export function d1(env: Env): D1Database {
  if (!env.D1DB) throw new Error('D1 database binding not configured');
  return env.D1DB;
}

export function userDoFor(env: Env, identifier: string): DurableObjectStub<UserDO> {
  return env.USER_DO.get(env.USER_DO.idFromName(identifier)) as DurableObjectStub<UserDO>;
}

export async function loadUserRow(userDO: DurableObjectStub<UserDO>): Promise<Record<string, unknown> | null> {
  const rows = await executeUtils.executeDynamicAction(userDO, 'select', {}, 'users');
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row?.id ? (row as Record<string, unknown>) : null;
}

export async function saveUserPatch(
  userDO: DurableObjectStub<UserDO>,
  userRowId: unknown,
  patch: Record<string, unknown>,
): Promise<void> {
  await executeUtils.executeDynamicAction(userDO, 'update', { id: userRowId, ...patch, queueStatus: 'pending' }, 'users');
}

export async function getEnterprise(db: D1Database, id: string): Promise<EnterpriseRow | null> {
  return db.prepare(`SELECT * FROM enterprises WHERE id = ?`).bind(id).first<EnterpriseRow>();
}

export async function requireEnterprise(db: D1Database, id: string): Promise<EnterpriseRow> {
  const org = await getEnterprise(db, id);
  if (!org) throw new EnterpriseError('ENTERPRISE_NOT_FOUND', 404);
  return org;
}

export async function listEnterprises(db: D1Database): Promise<EnterpriseRow[]> {
  const { results } = await db.prepare(`SELECT * FROM enterprises ORDER BY created_at DESC`).all<EnterpriseRow>();
  return results ?? [];
}

/** Persist §2.4 status when time or the hold flag has moved it. */
export async function refreshEnterpriseState(db: D1Database, org: EnterpriseRow, now: Date): Promise<EnterpriseRow> {
  const next = deriveEnterpriseState(org, now);
  if (next.status === org.status && next.seatGraceUntil === org.seat_grace_until) return org;
  const updatedAt = now.toISOString();
  await db
    .prepare(`UPDATE enterprises SET status = ?, seat_grace_until = ?, updated_at = ? WHERE id = ?`)
    .bind(next.status, next.seatGraceUntil, updatedAt, org.id)
    .run();
  return { ...org, status: next.status, seat_grace_until: next.seatGraceUntil, updated_at: updatedAt };
}

export async function getMembership(db: D1Database, userId: string): Promise<MemberRow | null> {
  return db.prepare(`SELECT * FROM enterprise_members WHERE user_id = ?`).bind(userId).first<MemberRow>();
}

export async function listMembers(db: D1Database, enterpriseId: string): Promise<MemberRow[]> {
  const { results } = await db
    .prepare(`SELECT * FROM enterprise_members WHERE enterprise_id = ? ORDER BY created_at`)
    .bind(enterpriseId)
    .all<MemberRow>();
  return results ?? [];
}

export async function insertEvent(
  db: D1Database,
  event: { enterpriseId: string; type: string; payload: Record<string, unknown>; actorId: string },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO enterprise_events (id, enterprise_id, type, payload, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), event.enterpriseId, event.type, JSON.stringify(event.payload), event.actorId, new Date().toISOString())
    .run();
}

export async function getInvoice(db: D1Database, id: string): Promise<InvoiceRow | null> {
  return db.prepare(`SELECT * FROM enterprise_invoices WHERE id = ?`).bind(id).first<InvoiceRow>();
}

export async function getPendingInvoice(db: D1Database, enterpriseId: string): Promise<InvoiceRow | null> {
  return db
    .prepare(`SELECT * FROM enterprise_invoices WHERE enterprise_id = ? AND status = 'pending' LIMIT 1`)
    .bind(enterpriseId)
    .first<InvoiceRow>();
}

export async function markSeatApplied(db: D1Database, invoiceId: string, userId: string): Promise<void> {
  await db
    .prepare(
      `UPDATE enterprise_invoices
         SET applied_user_ids = json_insert(applied_user_ids, '$[#]', ?)
       WHERE id = ? AND NOT EXISTS (SELECT 1 FROM json_each(applied_user_ids) WHERE value = ?)`,
    )
    .bind(userId, invoiceId, userId)
    .run();
}

/** Workflow counts per organization from the D1 projection of agent_workflows. */
export async function workflowCountsByEnterprise(
  db: D1Database,
): Promise<Map<string, { pending: number; accepted: number }>> {
  const { results } = await db
    .prepare(
      `SELECT "enterpriseId" AS enterprise_id, "enterpriseAcceptance" AS acceptance, COUNT(*) AS n
         FROM agent_workflows
        WHERE "enterpriseId" IS NOT NULL AND "enterpriseAcceptance" IN ('pending', 'accepted')
        GROUP BY "enterpriseId", "enterpriseAcceptance"`,
    )
    .all<{ enterprise_id: string; acceptance: 'pending' | 'accepted'; n: number }>();
  const out = new Map<string, { pending: number; accepted: number }>();
  for (const r of results ?? []) {
    const cur = out.get(r.enterprise_id) ?? { pending: 0, accepted: 0 };
    cur[r.acceptance] = Number(r.n) || 0;
    out.set(r.enterprise_id, cur);
  }
  return out;
}

/** Plan columns of every member from the D1 users projection. May lag the UserDO by one queue flush. */
export async function memberPlansFromD1(
  db: D1Database,
): Promise<Array<MemberRow & { user: Record<string, unknown> | null }>> {
  const { results } = await db
    .prepare(
      `SELECT m.enterprise_id, m.user_id, m.seat_role, m.created_at,
              u."planId" AS planId, u."planSource" AS planSource, u."planStatus" AS planStatus,
              u."planCurrentPeriodEnd" AS planCurrentPeriodEnd, u.identifier AS identifier
         FROM enterprise_members m
         LEFT JOIN users u ON u.identifier = m.user_id`,
    )
    .all<MemberRow & { planId?: string; planSource?: string; planStatus?: string; planCurrentPeriodEnd?: string; identifier?: string }>();
  return (results ?? []).map((r) => ({
    enterprise_id: r.enterprise_id,
    user_id: r.user_id,
    seat_role: r.seat_role,
    created_at: r.created_at,
    user: r.identifier
      ? { planId: r.planId, planSource: r.planSource, planStatus: r.planStatus, planCurrentPeriodEnd: r.planCurrentPeriodEnd }
      : null,
  }));
}

export async function workflowCountsFor(db: D1Database, enterpriseId: string): Promise<{ pending: number; accepted: number }> {
  const row = await db
    .prepare(
      `SELECT SUM(CASE WHEN "enterpriseAcceptance" = 'pending' THEN 1 ELSE 0 END) AS pending,
              SUM(CASE WHEN "enterpriseAcceptance" = 'accepted' THEN 1 ELSE 0 END) AS accepted
         FROM agent_workflows WHERE "enterpriseId" = ?`,
    )
    .bind(enterpriseId)
    .first<{ pending: number | null; accepted: number | null }>();
  return { pending: Number(row?.pending) || 0, accepted: Number(row?.accepted) || 0 };
}
