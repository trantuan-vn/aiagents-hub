import {
  EnterpriseError,
  isActiveSeat,
  seatExclusion,
  type EnterpriseRow,
  type SeatRole,
} from './domain';
import {
  d1,
  getMembership,
  insertEvent,
  listEnterprises,
  listMembers,
  loadUserRow,
  memberPlansFromD1,
  refreshEnterpriseState,
  requireEnterprise,
  saveUserPatch,
  userDoFor,
  workflowCountsByEnterprise,
  workflowCountsFor,
} from './store';

function orgView(org: EnterpriseRow) {
  return {
    id: org.id,
    name: org.name,
    status: org.status,
    minProSeats: org.min_pro_seats,
    periodEnd: org.period_end,
    planInterval: org.plan_interval,
    seatGraceUntil: org.seat_grace_until,
    adminHold: org.admin_hold === 1,
    note: org.note,
    createdAt: org.created_at,
    updatedAt: org.updated_at,
  };
}

export async function adminListEnterprises(env: Env, now = new Date()) {
  const db = d1(env);
  const [orgs, members, workflows] = await Promise.all([listEnterprises(db), memberPlansFromD1(db), workflowCountsByEnterprise(db)]);
  const out = [];
  for (const raw of orgs) {
    const org = await refreshEnterpriseState(db, raw, now);
    const seats = members.filter((m) => m.enterprise_id === org.id);
    const count = (role: SeatRole, pred: (m: (typeof seats)[number]) => boolean) =>
      seats.filter((m) => m.seat_role === role && pred(m)).length;
    out.push({
      ...orgView(org),
      billableBusiness: count('business', (m) => !seatExclusion(m.user)),
      billablePro: count('pro', (m) => !seatExclusion(m.user)),
      activeBusiness: count('business', (m) => isActiveSeat(m.user, 'business', now)),
      activePro: count('pro', (m) => isActiveSeat(m.user, 'pro', now)),
      workflows: workflows.get(org.id) ?? { pending: 0, accepted: 0 },
    });
  }
  return out;
}

export async function adminGetEnterprise(env: Env, id: string, now = new Date()) {
  const db = d1(env);
  const org = await refreshEnterpriseState(db, await requireEnterprise(db, id), now);
  const members = await listMembers(db, id);
  const { results: invoices } = await db
    .prepare(
      `SELECT id, kind, status, amount_usd, payer_user_id, period_end, created_at, paid_at
         FROM enterprise_invoices WHERE enterprise_id = ? ORDER BY created_at DESC LIMIT 50`,
    )
    .bind(id)
    .all();
  return {
    enterprise: orgView(org),
    members: members.map((m) => ({ userId: m.user_id, seatRole: m.seat_role, createdAt: m.created_at })),
    invoices: invoices ?? [],
    workflows: await workflowCountsFor(db, id),
  };
}

export async function adminCreateEnterprise(
  env: Env,
  actorId: string,
  body: { name: string; minProSeats: number; note?: string },
) {
  const db = d1(env);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO enterprises (id, name, min_pro_seats, status, admin_hold, note, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', 0, ?, ?, ?)`,
    )
    .bind(id, body.name, body.minProSeats, body.note ?? null, now, now)
    .run();
  await insertEvent(db, { enterpriseId: id, type: 'enterprise_created', payload: body, actorId });
  return orgView(await requireEnterprise(db, id));
}

export async function adminPatchEnterprise(
  env: Env,
  actorId: string,
  id: string,
  body: { name?: string; minProSeats?: number; note?: string | null; adminHold?: boolean },
) {
  const db = d1(env);
  const org = await requireEnterprise(db, id);
  const next: EnterpriseRow = {
    ...org,
    name: body.name ?? org.name,
    min_pro_seats: body.minProSeats ?? org.min_pro_seats,
    note: body.note === undefined ? org.note : body.note,
    admin_hold: body.adminHold === undefined ? org.admin_hold : body.adminHold ? 1 : 0,
    updated_at: new Date().toISOString(),
  };
  await db
    .prepare(`UPDATE enterprises SET name = ?, min_pro_seats = ?, note = ?, admin_hold = ?, updated_at = ? WHERE id = ?`)
    .bind(next.name, next.min_pro_seats, next.note, next.admin_hold, next.updated_at, id)
    .run();
  if (next.admin_hold !== org.admin_hold) {
    await insertEvent(db, { enterpriseId: id, type: next.admin_hold ? 'admin_hold_on' : 'admin_hold_off', payload: {}, actorId });
  }
  return orgView(await refreshEnterpriseState(db, next, new Date()));
}

export async function adminDeleteEnterprise(env: Env, actorId: string, id: string): Promise<void> {
  const db = d1(env);
  await requireEnterprise(db, id);
  const wf = await workflowCountsFor(db, id);
  if (wf.pending > 0 || wf.accepted > 0) throw new EnterpriseError('ENTERPRISE_HAS_WORKFLOWS', 409);
  if ((await listMembers(db, id)).length > 0) throw new EnterpriseError('ENTERPRISE_HAS_MEMBERS', 409);
  await db.prepare(`DELETE FROM enterprises WHERE id = ?`).bind(id).run();
  await insertEvent(db, { enterpriseId: id, type: 'enterprise_deleted', payload: {}, actorId });
}

export async function adminAddMember(env: Env, actorId: string, id: string, body: { userId: string; seatRole: SeatRole }) {
  const db = d1(env);
  await requireEnterprise(db, id);
  if (!(await loadUserRow(userDoFor(env, body.userId)))) throw new EnterpriseError('USER_NOT_FOUND', 404);
  try {
    await db
      .prepare(`INSERT INTO enterprise_members (enterprise_id, user_id, seat_role, created_at) VALUES (?, ?, ?, ?)`)
      .bind(id, body.userId, body.seatRole, new Date().toISOString())
      .run();
  } catch (err) {
    if (String(err).includes('UNIQUE')) throw new EnterpriseError('ENTERPRISE_MEMBER_TAKEN', 409);
    throw err;
  }
  await insertEvent(db, { enterpriseId: id, type: 'member_added', payload: body, actorId });
  return { userId: body.userId, seatRole: body.seatRole };
}

export async function adminRemoveMember(env: Env, actorId: string, id: string, userId: string): Promise<void> {
  const db = d1(env);
  const member = await getMembership(db, userId);
  if (!member || member.enterprise_id !== id) throw new EnterpriseError('ENTERPRISE_NOT_MEMBER', 404);

  if (member.seat_role === 'business') {
    const businessSeats = (await listMembers(db, id)).filter((m) => m.seat_role === 'business').length;
    if (businessSeats <= 1 && (await workflowCountsFor(db, id)).accepted > 0) {
      throw new EnterpriseError('ENTERPRISE_LAST_BUSINESS_SEAT', 409);
    }
  }

  await db.batch([
    db.prepare(`DELETE FROM enterprise_trigger_grants WHERE enterprise_id = ? AND grantee_user_id = ?`).bind(id, userId),
    db.prepare(`DELETE FROM enterprise_trigger_credentials WHERE enterprise_id = ? AND grantee_user_id = ?`).bind(id, userId),
    db.prepare(`DELETE FROM enterprise_members WHERE enterprise_id = ? AND user_id = ?`).bind(id, userId),
  ]);

  const userDO = userDoFor(env, userId);
  const user = await loadUserRow(userDO);
  if (user && String(user.planSource ?? '').toLowerCase() === 'enterprise') {
    await saveUserPatch(userDO, user.id, { planId: 'free', planSource: 'free', planStatus: 'none', pendingPlanId: null });
  }
  await insertEvent(db, { enterpriseId: id, type: 'member_removed', payload: { userId, seatRole: member.seat_role }, actorId });
}
