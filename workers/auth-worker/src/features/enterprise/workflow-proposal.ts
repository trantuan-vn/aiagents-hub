import { getWorkflowRoyaltyPercentFromEnv } from '../member/workflows/billing/get-royalty-percent';
import { EnterpriseError, isActiveSeat, type EnterpriseRow, type MemberRow } from './domain';
import {
  d1,
  getEnterprise,
  getMembership,
  insertEvent,
  loadUserRow,
  refreshEnterpriseState,
  requireEnterprise,
  userDoFor,
} from './store';
import {
  deleteWorkflowGrants,
  isEnterpriseWorkflow,
  ownerIdOf,
  requireOwnerWorkflow,
  writeOwnerWorkflow,
} from './workflow-flag';
import { listEnterpriseTriggers } from './trigger-keys';

type Acceptance = 'none' | 'pending' | 'accepted';

const CLEARED_PROPOSAL = { enterpriseId: null, enterpriseAcceptance: 'none', acceptedRoyaltyPercent: null } as const;

function acceptanceOf(wf: Record<string, unknown>): Acceptance {
  const v = String(wf.enterpriseAcceptance ?? 'none');
  return v === 'pending' || v === 'accepted' ? v : 'none';
}

function enterpriseIdOf(wf: Record<string, unknown>): string | null {
  return wf.enterpriseId ? String(wf.enterpriseId) : null;
}

// --- Owner (§3.2) --------------------------------------------------------

/**
 * Owner `PUT /:id` with `{ enterpriseId }`. The royalty shown on the proposal is the platform rate now;
 * it is stored on the row so a later admin edit does not change what the Business user accepts.
 */
export async function ownerSetEnterpriseProposal(
  env: Env,
  identifier: string,
  workflowId: number,
  enterpriseId: string | null,
  now = new Date(),
): Promise<Record<string, unknown>> {
  const db = d1(env);
  const ownerId = ownerIdOf(env, identifier);
  const wf = await requireOwnerWorkflow(env, ownerId, workflowId);
  const acceptance = acceptanceOf(wf);
  const currentOrg = enterpriseIdOf(wf);

  if (enterpriseId === null) {
    if (acceptance === 'accepted') throw new EnterpriseError('ENTERPRISE_ACCEPTED', 409);
    if (acceptance === 'none') return wf;
    await writeOwnerWorkflow(env, ownerId, workflowId, CLEARED_PROPOSAL);
    await deleteWorkflowGrants(db, ownerId, workflowId);
    if (currentOrg) {
      await insertEvent(db, { enterpriseId: currentOrg, type: 'proposal_withdrawn', payload: { ownerId, workflowId }, actorId: identifier });
    }
    return { ...wf, ...CLEARED_PROPOSAL };
  }

  if (!isEnterpriseWorkflow(wf)) throw new EnterpriseError('ENTERPRISE_FLAG_REQUIRED', 403);
  if (currentOrg === enterpriseId && acceptance !== 'none') return wf;
  if (acceptance === 'accepted') throw new EnterpriseError('ENTERPRISE_ACCEPTED', 409);

  const org = await getEnterprise(db, enterpriseId);
  if (!org) throw new EnterpriseError('ENTERPRISE_NOT_FOUND', 404);
  if ((await refreshEnterpriseState(db, org, now)).status !== 'active') {
    throw new EnterpriseError('ENTERPRISE_NOT_ACTIVE', 403);
  }

  const patch = {
    enterpriseId,
    enterpriseAcceptance: 'pending',
    acceptedRoyaltyPercent: await getWorkflowRoyaltyPercentFromEnv(env),
  };
  await writeOwnerWorkflow(env, ownerId, workflowId, patch);
  await deleteWorkflowGrants(db, ownerId, workflowId);
  if (currentOrg && currentOrg !== enterpriseId) {
    await insertEvent(db, { enterpriseId: currentOrg, type: 'proposal_withdrawn', payload: { ownerId, workflowId }, actorId: identifier });
  }
  await insertEvent(db, {
    enterpriseId,
    type: 'proposal_sent',
    payload: { ownerId, workflowId, royaltyPercent: patch.acceptedRoyaltyPercent },
    actorId: identifier,
  });
  return { ...wf, ...patch };
}

// --- Business (§3.2) -----------------------------------------------------

export type BusinessDecision = 'accept' | 'reject' | 'release';

async function businessContext(env: Env, identifier: string, now: Date): Promise<{ org: EnterpriseRow; member: MemberRow }> {
  const db = d1(env);
  const member = await getMembership(db, identifier);
  if (!member) throw new EnterpriseError('ENTERPRISE_NOT_MEMBER', 403);
  if (member.seat_role !== 'business') throw new EnterpriseError('ENTERPRISE_BUSINESS_ONLY', 403);
  const org = await refreshEnterpriseState(db, await requireEnterprise(db, member.enterprise_id), now);
  return { org, member };
}

/**
 * Reads acceptance on the owner's UserDO and writes it back there; D1 only sees it after the queue flush.
 * Accepting needs an active organization and an active Business seat. Reject and release stay open while
 * the organization is suspended so the Business user can still let go of a workflow.
 */
export async function businessDecideProposal(
  env: Env,
  identifier: string,
  ownerId: string,
  workflowId: number,
  decision: BusinessDecision,
  now = new Date(),
): Promise<void> {
  const db = d1(env);
  const { org } = await businessContext(env, identifier, now);
  const wf = await requireOwnerWorkflow(env, ownerId, workflowId);
  if (!isEnterpriseWorkflow(wf) || enterpriseIdOf(wf) !== org.id) {
    throw new EnterpriseError('ENTERPRISE_WORKFLOW_NOT_FOUND', 404);
  }
  const acceptance = acceptanceOf(wf);
  const required: Acceptance = decision === 'release' ? 'accepted' : 'pending';
  if (acceptance !== required) {
    throw new EnterpriseError(decision === 'release' ? 'ENTERPRISE_NOT_ACCEPTED' : 'ENTERPRISE_PROPOSAL_NOT_PENDING', 409);
  }

  if (decision === 'accept') {
    if (org.status !== 'active') throw new EnterpriseError('ENTERPRISE_NOT_ACTIVE', 403);
    const caller = await loadUserRow(userDoFor(env, identifier));
    if (!isActiveSeat(caller, 'business', now)) throw new EnterpriseError('ENTERPRISE_SEAT_INACTIVE', 403);
    const offered = Number(wf.acceptedRoyaltyPercent);
    const royaltyPercent =
      wf.acceptedRoyaltyPercent != null && Number.isFinite(offered) ? offered : await getWorkflowRoyaltyPercentFromEnv(env);
    await writeOwnerWorkflow(env, ownerId, workflowId, { enterpriseAcceptance: 'accepted', acceptedRoyaltyPercent: royaltyPercent });
    await insertEvent(db, { enterpriseId: org.id, type: 'proposal_accepted', payload: { ownerId, workflowId, royaltyPercent }, actorId: identifier });
    return;
  }

  await writeOwnerWorkflow(env, ownerId, workflowId, CLEARED_PROPOSAL);
  await deleteWorkflowGrants(db, ownerId, workflowId);
  await insertEvent(db, {
    enterpriseId: org.id,
    type: decision === 'release' ? 'workflow_released' : 'proposal_rejected',
    payload: { ownerId, workflowId },
    actorId: identifier,
  });
}

// --- Organization block (§3.3) ---------------------------------------------

type CatalogRow = {
  id: number;
  user_id: string;
  name: string;
  description: string | null;
  tags: string | null;
  acceptedRoyaltyPercent: number | null;
  owner_identifier: string | null;
  definition?: string | null;
  granted_keys?: string | null;
};

/** `granted` limits the card to those keys (Pro); undefined shows every key on the graph (Business). */
function catalogView(r: CatalogRow, granted?: Set<string>) {
  const triggers = listEnterpriseTriggers(r.definition)
    .filter((t) => !granted || granted.has(t.triggerKey))
    .map(({ triggerKey, kind, label, fields }) => ({ triggerKey, kind, label, ...(fields ? { fields } : {}) }));
  return {
    id: r.id,
    ownerId: r.user_id,
    ownerIdentifier: r.owner_identifier,
    name: r.name,
    description: r.description,
    tags: r.tags ?? '[]',
    royaltyPercent: r.acceptedRoyaltyPercent,
    triggers,
  };
}

const CATALOG_COLUMNS = `w.id, w.user_id, w.name, w.description, w.tags, w."acceptedRoyaltyPercent" AS acceptedRoyaltyPercent,
       w.definition, u.identifier AS owner_identifier`;

/**
 * `GET /dashboard/build/workflows/enterprise`. One D1 query over the agent_workflows projection, never
 * the owners' UserDOs; definitions are not returned. Business sees accepted workflows plus pending
 * proposals; Pro sees accepted workflows it holds at least one grant on.
 */
export async function enterpriseCatalog(env: Env, identifier: string, now = new Date()) {
  type Card = ReturnType<typeof catalogView>;
  const db = d1(env);
  const member = await getMembership(db, identifier);
  if (!member) return { enterprise: null, workflows: [] as Card[], proposals: [] as Card[] };
  const org = await refreshEnterpriseState(db, await requireEnterprise(db, member.enterprise_id), now);
  const caller = await loadUserRow(userDoFor(env, identifier));
  const seatActive = isActiveSeat(caller, member.seat_role, now);
  const enterprise = {
    ...(member.seat_role === 'business' ? { id: org.id } : {}),
    name: org.name,
    status: org.status,
    seatRole: member.seat_role,
    seatActive,
    periodEnd: org.period_end,
    seatGraceUntil: org.seat_grace_until,
  };
  const empty = { enterprise, workflows: [] as Card[], proposals: [] as Card[] };
  if (org.status !== 'active' || !seatActive) return empty;

  const acceptedWhere = `COALESCE(w."isEnterprise", 0) = 1 AND w."isShared" = 1 AND w.status = 'published'
     AND w."enterpriseAcceptance" = 'accepted' AND w."enterpriseId" = ?`;

  if (member.seat_role === 'pro') {
    const { results } = await db
      .prepare(
        `SELECT ${CATALOG_COLUMNS}, g.granted_keys
           FROM agent_workflows w
           JOIN (SELECT workflow_owner_id, workflow_id, group_concat(trigger_key) AS granted_keys
                   FROM enterprise_trigger_grants
                  WHERE enterprise_id = ? AND grantee_user_id = ?
                  GROUP BY workflow_owner_id, workflow_id) g
             ON g.workflow_owner_id = w.user_id AND g.workflow_id = w.id
           LEFT JOIN users u ON u.user_id = w.user_id
          WHERE ${acceptedWhere}
          ORDER BY w.name`,
      )
      .bind(org.id, identifier, org.id)
      .all<CatalogRow>();
    const workflows = (results ?? [])
      .map((r) => catalogView(r, new Set(String(r.granted_keys ?? '').split(',').filter(Boolean))))
      .filter((w) => w.triggers.length > 0);
    return { enterprise, workflows, proposals: [] as Card[] };
  }

  const [accepted, pending] = await db.batch<CatalogRow>([
    db
      .prepare(
        `SELECT ${CATALOG_COLUMNS} FROM agent_workflows w LEFT JOIN users u ON u.user_id = w.user_id
          WHERE ${acceptedWhere} ORDER BY w.name`,
      )
      .bind(org.id),
    db
      .prepare(
        `SELECT ${CATALOG_COLUMNS} FROM agent_workflows w LEFT JOIN users u ON u.user_id = w.user_id
          WHERE COALESCE(w."isEnterprise", 0) = 1 AND w."enterpriseAcceptance" = 'pending' AND w."enterpriseId" = ?
          ORDER BY w.updated_at DESC`,
      )
      .bind(org.id),
  ]);
  return {
    enterprise,
    workflows: (accepted.results ?? []).map((r) => catalogView(r)),
    proposals: (pending.results ?? []).map((r) => catalogView(r)),
  };
}
