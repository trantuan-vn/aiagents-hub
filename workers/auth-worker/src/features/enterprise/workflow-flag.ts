import type { UserDO } from '../ws/infrastructure/UserDO';
import { executeUtils } from '../../shared/utils';
import { EnterpriseError } from './domain';
import { d1, insertEvent } from './store';
import { assignEnterpriseTriggerKeys } from './trigger-keys';

export type FlagRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export type FlagRequestRow = {
  id: string;
  workflow_owner_id: string;
  workflow_id: number;
  note: string | null;
  status: FlagRequestStatus;
  reason: string | null;
  actor_id: string | null;
  created_at: string;
  resolved_at: string | null;
};

export function isEnterpriseWorkflow(wf: Record<string, unknown> | null | undefined): boolean {
  const v = wf?.isEnterprise;
  return v === true || v === 1 || v === '1';
}

/** Royalty % the organization accepted (§3.2). Admin edits to the platform rate do not reach it. */
export function frozenEnterpriseRoyaltyPercent(wf: Record<string, unknown> | null | undefined): number | undefined {
  if (!isEnterpriseWorkflow(wf) || wf?.enterpriseAcceptance !== 'accepted') return undefined;
  const pct = Number(wf.acceptedRoyaltyPercent);
  return wf.acceptedRoyaltyPercent != null && Number.isFinite(pct) ? pct : undefined;
}

/** `ownerId` is the owner's UserDO id string, the same value as `agent_workflows.user_id` on D1. */
export function ownerDo(env: Env, ownerId: string): DurableObjectStub<UserDO> {
  if (!/^[0-9a-f]{64}$/i.test(ownerId)) throw new Error('Workflow not found');
  return env.USER_DO.get(env.USER_DO.idFromString(ownerId)) as DurableObjectStub<UserDO>;
}

export function ownerIdOf(env: Env, identifier: string): string {
  return env.USER_DO.idFromName(identifier).toString();
}

export async function loadOwnerWorkflow(
  env: Env,
  ownerId: string,
  workflowId: number,
): Promise<Record<string, unknown> | null> {
  const rows = await executeUtils.executeDynamicAction(
    ownerDo(env, ownerId),
    'select',
    { where: { field: 'id', operator: '=', value: workflowId } },
    'agent_workflows',
  );
  const wf = Array.isArray(rows) ? rows[0] : rows;
  return wf ? (wf as Record<string, unknown>) : null;
}

export async function requireOwnerWorkflow(env: Env, ownerId: string, workflowId: number): Promise<Record<string, unknown>> {
  const wf = await loadOwnerWorkflow(env, ownerId, workflowId);
  if (!wf) throw new EnterpriseError('ENTERPRISE_WORKFLOW_NOT_FOUND', 404);
  return wf;
}

export async function writeOwnerWorkflow(env: Env, ownerId: string, workflowId: number, patch: Record<string, unknown>) {
  await executeUtils.executeDynamicAction(ownerDo(env, ownerId), 'update', { id: workflowId, ...patch }, 'agent_workflows');
}

export async function deleteWorkflowGrants(db: D1Database, ownerId: string, workflowId: number): Promise<void> {
  await db.batch([
    db.prepare(`DELETE FROM enterprise_trigger_grants WHERE workflow_owner_id = ? AND workflow_id = ?`).bind(ownerId, workflowId),
    db.prepare(`DELETE FROM enterprise_trigger_credentials WHERE workflow_owner_id = ? AND workflow_id = ?`).bind(ownerId, workflowId),
  ]);
}

/**
 * Public doors (community detail, comment, star, shared execute/chat) read the flag on the owner's UserDO.
 * The D1 projection may still show the row until the queue flushes.
 */
export async function assertPublicSharedOnOwnerDo(env: Env, ownerId: string, workflowId: number): Promise<Record<string, unknown>> {
  const wf = await loadOwnerWorkflow(env, ownerId, workflowId);
  const shared = wf?.isShared === true || wf?.isShared === 1;
  if (!wf || !shared || isEnterpriseWorkflow(wf)) {
    throw new Error('Shared workflow not found');
  }
  return wf;
}

function flagRequestView(r: FlagRequestRow) {
  return {
    id: r.id,
    workflowOwnerId: r.workflow_owner_id,
    workflowId: r.workflow_id,
    note: r.note,
    status: r.status,
    reason: r.reason,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
  };
}

// --- Owner ---------------------------------------------------------------

export async function ownerRequestFlag(env: Env, identifier: string, workflowId: number, note?: string) {
  const db = d1(env);
  const ownerId = ownerIdOf(env, identifier);
  const wf = await requireOwnerWorkflow(env, ownerId, workflowId);
  if (isEnterpriseWorkflow(wf)) throw new EnterpriseError('ENTERPRISE_FLAG_ALREADY_SET', 409);
  const id = crypto.randomUUID();
  try {
    await db
      .prepare(
        `INSERT INTO enterprise_flag_requests (id, workflow_owner_id, workflow_id, note, status, created_at)
         VALUES (?, ?, ?, ?, 'pending', ?)`,
      )
      .bind(id, ownerId, workflowId, note ?? null, new Date().toISOString())
      .run();
  } catch (err) {
    if (String(err).includes('UNIQUE')) throw new EnterpriseError('ENTERPRISE_FLAG_REQUEST_PENDING', 409);
    throw err;
  }
  return ownerLatestFlagRequest(env, identifier, workflowId);
}

export async function ownerWithdrawFlag(env: Env, identifier: string, workflowId: number): Promise<void> {
  const res = await d1(env)
    .prepare(
      `UPDATE enterprise_flag_requests SET status = 'cancelled', resolved_at = ?
        WHERE workflow_owner_id = ? AND workflow_id = ? AND status = 'pending'`,
    )
    .bind(new Date().toISOString(), ownerIdOf(env, identifier), workflowId)
    .run();
  if (res.meta.changes === 0) throw new EnterpriseError('ENTERPRISE_FLAG_REQUEST_NOT_PENDING', 404);
}

/** Latest request so the owner sees a rejection reason. */
export async function ownerLatestFlagRequest(env: Env, identifier: string, workflowId: number) {
  const row = await d1(env)
    .prepare(
      `SELECT * FROM enterprise_flag_requests WHERE workflow_owner_id = ? AND workflow_id = ?
        ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(ownerIdOf(env, identifier), workflowId)
    .first<FlagRequestRow>();
  return row ? flagRequestView(row) : null;
}

/**
 * Before the owner deletes a workflow: an organization still depends on it when the proposal is
 * pending or accepted. Otherwise drop its pending flag request with the workflow.
 */
export async function beforeOwnerDeletesWorkflow(env: Env, identifier: string, workflowId: number): Promise<void> {
  const ownerId = ownerIdOf(env, identifier);
  const wf = await loadOwnerWorkflow(env, ownerId, workflowId);
  const acceptance = String(wf?.enterpriseAcceptance ?? 'none');
  if (acceptance === 'pending' || acceptance === 'accepted') throw new EnterpriseError('ENTERPRISE_ACCEPTED', 409);
  await d1(env)
    .prepare(`DELETE FROM enterprise_flag_requests WHERE workflow_owner_id = ? AND workflow_id = ? AND status = 'pending'`)
    .bind(ownerId, workflowId)
    .run();
}

// --- Admin ---------------------------------------------------------------

export async function adminListFlagRequests(env: Env) {
  const db = d1(env);
  const { results } = await db
    .prepare(
      `SELECT r.*, u.identifier AS owner_identifier
         FROM enterprise_flag_requests r
         LEFT JOIN users u ON u.user_id = r.workflow_owner_id
        WHERE r.status = 'pending'
        ORDER BY r.created_at ASC LIMIT 200`,
    )
    .all<FlagRequestRow & { owner_identifier: string | null }>();
  return Promise.all(
    (results ?? []).map(async (r) => {
      const wf = await loadOwnerWorkflow(env, r.workflow_owner_id, r.workflow_id).catch(() => null);
      return {
        ...flagRequestView(r),
        ownerIdentifier: r.owner_identifier,
        workflow: wf
          ? { name: wf.name, status: wf.status, isShared: wf.isShared === true || wf.isShared === 1 }
          : null,
      };
    }),
  );
}

/** Flagged workflows from the D1 projection, which may lag the owners' UserDOs. */
export async function adminListEnterpriseWorkflows(env: Env) {
  const { results } = await d1(env)
    .prepare(
      `SELECT w.user_id, w.id, w.name, w.status, w."isShared" AS isShared, w."enterpriseId" AS enterpriseId,
              w."enterpriseAcceptance" AS enterpriseAcceptance, u.identifier AS owner_identifier, e.name AS enterprise_name
         FROM agent_workflows w
         LEFT JOIN users u ON u.user_id = w.user_id
         LEFT JOIN enterprises e ON e.id = w."enterpriseId"
        WHERE COALESCE(w."isEnterprise", 0) = 1
        ORDER BY w.updated_at DESC LIMIT 500`,
    )
    .all<Record<string, unknown>>();
  return (results ?? []).map((r) => ({
    ownerId: String(r.user_id),
    ownerIdentifier: r.owner_identifier == null ? null : String(r.owner_identifier),
    workflowId: Number(r.id),
    name: String(r.name ?? ''),
    status: String(r.status ?? 'draft'),
    isShared: Number(r.isShared) === 1,
    enterpriseId: r.enterpriseId == null ? null : String(r.enterpriseId),
    enterpriseName: r.enterprise_name == null ? null : String(r.enterprise_name),
    enterpriseAcceptance: String(r.enterpriseAcceptance ?? 'none'),
  }));
}

async function requireFlagRequest(env: Env, id: string): Promise<FlagRequestRow> {
  const row = await d1(env).prepare(`SELECT * FROM enterprise_flag_requests WHERE id = ?`).bind(id).first<FlagRequestRow>();
  if (!row) throw new EnterpriseError('ENTERPRISE_FLAG_REQUEST_NOT_FOUND', 404);
  return row;
}

/** Read-only canvas: the graph as it stands on the owner's UserDO, not the D1 copy. */
export async function adminGetFlagRequest(env: Env, id: string) {
  const req = await requireFlagRequest(env, id);
  const wf = await requireOwnerWorkflow(env, req.workflow_owner_id, req.workflow_id);
  return {
    request: flagRequestView(req),
    workflow: {
      id: req.workflow_id,
      ownerId: req.workflow_owner_id,
      name: wf.name,
      description: wf.description ?? null,
      tags: wf.tags ?? '[]',
      definition: wf.definition,
      status: wf.status,
      isShared: wf.isShared === true || wf.isShared === 1,
      isEnterprise: isEnterpriseWorkflow(wf),
    },
  };
}

/** Set the flag on the owner's UserDO only. The queue projects it to D1. */
async function approvePendingRequest(env: Env, actorId: string, req: FlagRequestRow): Promise<void> {
  const db = d1(env);
  const now = new Date().toISOString();
  const claimed = await db
    .prepare(
      `UPDATE enterprise_flag_requests SET status = 'approved', actor_id = ?, resolved_at = ? WHERE id = ? AND status = 'pending'`,
    )
    .bind(actorId, now, req.id)
    .run();
  if (claimed.meta.changes === 0) throw new EnterpriseError('ENTERPRISE_FLAG_REQUEST_NOT_PENDING', 409);
  try {
    const wf = await requireOwnerWorkflow(env, req.workflow_owner_id, req.workflow_id);
    const definition = String(wf.definition ?? '{"nodes":[],"edges":[]}');
    const keyed = assignEnterpriseTriggerKeys(definition, definition);
    await writeOwnerWorkflow(env, req.workflow_owner_id, req.workflow_id, {
      ...(keyed !== definition ? { definition: keyed } : {}),
      isEnterprise: true,
      enterpriseId: null,
      enterpriseAcceptance: 'none',
      acceptedRoyaltyPercent: null,
    });
  } catch (err) {
    await db
      .prepare(`UPDATE enterprise_flag_requests SET status = 'pending', actor_id = NULL, resolved_at = NULL WHERE id = ?`)
      .bind(req.id)
      .run();
    throw err;
  }
}

export async function adminApproveFlagRequest(env: Env, actorId: string, id: string): Promise<void> {
  await approvePendingRequest(env, actorId, await requireFlagRequest(env, id));
}

export async function adminRejectFlagRequest(env: Env, actorId: string, id: string, reason: string): Promise<void> {
  const res = await d1(env)
    .prepare(
      `UPDATE enterprise_flag_requests SET status = 'rejected', reason = ?, actor_id = ?, resolved_at = ?
        WHERE id = ? AND status = 'pending'`,
    )
    .bind(reason, actorId, new Date().toISOString(), id)
    .run();
  if (res.meta.changes === 0) throw new EnterpriseError('ENTERPRISE_FLAG_REQUEST_NOT_PENDING', 409);
}

/** `PUT /dashboard/admin/workflows/:ownerId/:workflowId/enterprise` (§3.1). */
export async function adminSetWorkflowFlag(
  env: Env,
  actorId: string,
  ownerId: string,
  workflowId: number,
  body: { isEnterprise: boolean; force?: boolean },
): Promise<void> {
  const db = d1(env);
  if (body.isEnterprise) {
    const req = await db
      .prepare(
        `SELECT * FROM enterprise_flag_requests WHERE workflow_owner_id = ? AND workflow_id = ? AND status = 'pending' LIMIT 1`,
      )
      .bind(ownerId, workflowId)
      .first<FlagRequestRow>();
    if (!req) throw new EnterpriseError('ENTERPRISE_FLAG_REQUEST_REQUIRED', 409);
    await approvePendingRequest(env, actorId, req);
    return;
  }

  const wf = await requireOwnerWorkflow(env, ownerId, workflowId);
  if (!isEnterpriseWorkflow(wf)) return;
  const acceptance = String(wf.enterpriseAcceptance ?? 'none');
  if (acceptance === 'accepted' && !body.force) throw new EnterpriseError('ENTERPRISE_ACCEPTED', 409);

  await writeOwnerWorkflow(env, ownerId, workflowId, {
    isEnterprise: false,
    enterpriseId: null,
    enterpriseAcceptance: 'none',
    acceptedRoyaltyPercent: null,
    ...(acceptance === 'accepted' ? { isShared: false } : {}),
  });
  await deleteWorkflowGrants(db, ownerId, workflowId);
  const enterpriseId = wf.enterpriseId ? String(wf.enterpriseId) : '';
  if (enterpriseId) {
    await insertEvent(db, {
      enterpriseId,
      type: body.force ? 'workflow_flag_forced_off' : 'workflow_flag_off',
      payload: { ownerId, workflowId, acceptance },
      actorId,
    });
  }
}
