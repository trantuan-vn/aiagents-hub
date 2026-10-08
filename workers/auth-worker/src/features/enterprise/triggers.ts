import { executeWorkflowGraph } from '../member/workflows/engine/executor';
import { parseWorkflowDefinition, type ResolvedWorkflow } from '../member/workflows/execution/workflow-context';
import { bindResolvedToActor, consumerRunActor } from '../member/workflows/execution/workflow-runner';
import { parseWebhookRequest, resolveWebhookQuestion, type BuildWebhookItemParams } from '../member/workflows/nodes/webhook/output';
import { runChatTrigger } from '../member/workflows/triggers/chat-submission';
import { resolveNodeFormPath, runFormSubmissionTrigger } from '../member/workflows/triggers/form-submission';
import { EnterpriseError, isActiveSeat, type EnterpriseRow, type MemberRow } from './domain';
import { d1, getEnterprise, getMembership, insertEvent, listMembers, loadUserRow, refreshEnterpriseState, userDoFor } from './store';
import { listEnterpriseTriggers, type EnterpriseTrigger } from './trigger-keys';
import { isEnterpriseWorkflow, loadOwnerWorkflow, requireOwnerWorkflow } from './workflow-flag';

const BINDING = 'USER_DO';

type GrantRow = {
  enterprise_id: string;
  workflow_owner_id: string;
  workflow_id: number;
  grantee_user_id: string;
  trigger_key: string;
  monthly_credit_cap: number | null;
};

// --- Credentials -----------------------------------------------------------

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `ent_${b64}`;
}

/** Replaces any credential this user had on the key. The plaintext leaves the server only here. */
async function issueCredential(
  db: D1Database,
  row: { enterpriseId: string; ownerId: string; workflowId: number; granteeUserId: string; triggerKey: string },
): Promise<string> {
  const token = newToken();
  await db.batch([
    db
      .prepare(
        `DELETE FROM enterprise_trigger_credentials
          WHERE workflow_owner_id = ? AND workflow_id = ? AND grantee_user_id = ? AND trigger_key = ?`,
      )
      .bind(row.ownerId, row.workflowId, row.granteeUserId, row.triggerKey),
    db
      .prepare(
        `INSERT INTO enterprise_trigger_credentials
           (id, enterprise_id, workflow_owner_id, workflow_id, grantee_user_id, trigger_key, token_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        row.enterpriseId,
        row.ownerId,
        row.workflowId,
        row.granteeUserId,
        row.triggerKey,
        await sha256Hex(token),
        new Date().toISOString(),
      ),
  ]);
  return token;
}

// --- Business: grants and credentials (§3.5) --------------------------------

function isAcceptedFor(wf: Record<string, unknown>, orgId: string): boolean {
  return isEnterpriseWorkflow(wf) && wf.enterpriseAcceptance === 'accepted' && String(wf.enterpriseId ?? '') === orgId;
}

/** Active Business seat of an active organization, on a workflow that organization accepted. */
async function businessOnAcceptedWorkflow(env: Env, identifier: string, ownerId: string, workflowId: number, now: Date) {
  const db = d1(env);
  const member = await getMembership(db, identifier);
  if (!member) throw new EnterpriseError('ENTERPRISE_NOT_MEMBER', 403);
  if (member.seat_role !== 'business') throw new EnterpriseError('ENTERPRISE_BUSINESS_ONLY', 403);
  const org = await getEnterprise(db, member.enterprise_id);
  if (!org || (await refreshEnterpriseState(db, org, now)).status !== 'active') {
    throw new EnterpriseError('ENTERPRISE_NOT_ACTIVE', 403);
  }
  if (!isActiveSeat(await loadUserRow(userDoFor(env, identifier)), 'business', now)) {
    throw new EnterpriseError('ENTERPRISE_SEAT_INACTIVE', 403);
  }
  const wf = await requireOwnerWorkflow(env, ownerId, workflowId);
  if (!isAcceptedFor(wf, org.id)) throw new EnterpriseError('ENTERPRISE_WORKFLOW_NOT_FOUND', 404);
  return { db, org, triggers: listEnterpriseTriggers(wf.definition) };
}

export async function businessListGrants(env: Env, identifier: string, ownerId: string, workflowId: number, now = new Date()) {
  const { db, org, triggers } = await businessOnAcceptedWorkflow(env, identifier, ownerId, workflowId, now);
  const [grants, creds] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        `SELECT grantee_user_id, trigger_key, monthly_credit_cap FROM enterprise_trigger_grants
          WHERE enterprise_id = ? AND workflow_owner_id = ? AND workflow_id = ?`,
      )
      .bind(org.id, ownerId, workflowId),
    db
      .prepare(
        `SELECT grantee_user_id, trigger_key FROM enterprise_trigger_credentials
          WHERE enterprise_id = ? AND workflow_owner_id = ? AND workflow_id = ?`,
      )
      .bind(org.id, ownerId, workflowId),
  ]);
  const issued = new Set((creds.results ?? []).map((r) => `${r.grantee_user_id}:${r.trigger_key}`));
  const members = await listMembers(db, org.id);
  return {
    triggers,
    proMembers: members.filter((m) => m.seat_role === 'pro').map((m) => m.user_id),
    grants: (grants.results ?? []).map((r) => ({
      granteeUserId: String(r.grantee_user_id),
      triggerKey: String(r.trigger_key),
      monthlyCreditCap: r.monthly_credit_cap == null ? null : Number(r.monthly_credit_cap),
      hasCredential: issued.has(`${r.grantee_user_id}:${r.trigger_key}`),
    })),
  };
}

/**
 * Sets one Pro user's keys on a workflow to exactly `triggerKeys` (keys on the graph right now).
 * New keys get a credential whose plaintext is returned once; dropped keys lose grant and credential.
 */
export async function businessPutGrants(
  env: Env,
  identifier: string,
  ownerId: string,
  workflowId: number,
  body: { granteeUserId: string; triggerKeys: string[]; monthlyCreditCap?: number | null },
  now = new Date(),
) {
  const { db, org, triggers } = await businessOnAcceptedWorkflow(env, identifier, ownerId, workflowId, now);
  const grantee = await getMembership(db, body.granteeUserId);
  if (!grantee || grantee.enterprise_id !== org.id || grantee.seat_role !== 'pro') {
    throw new EnterpriseError('ENTERPRISE_GRANTEE_NOT_PRO', 403);
  }
  const keys = [...new Set(body.triggerKeys)];
  const onGraph = new Set(triggers.map((t) => t.triggerKey));
  if (keys.some((k) => !onGraph.has(k))) throw new EnterpriseError('ENTERPRISE_TRIGGER_NOT_FOUND', 400);
  if (keys.length > 0 && !isActiveSeat(await loadUserRow(userDoFor(env, grantee.user_id)), 'pro', now)) {
    throw new EnterpriseError('ENTERPRISE_GRANTEE_INACTIVE', 403);
  }

  const { results: existingRows } = await db
    .prepare(
      `SELECT trigger_key, monthly_credit_cap FROM enterprise_trigger_grants
        WHERE workflow_owner_id = ? AND workflow_id = ? AND grantee_user_id = ?`,
    )
    .bind(ownerId, workflowId, grantee.user_id)
    .all<{ trigger_key: string; monthly_credit_cap: number | null }>();
  const existing = new Set((existingRows ?? []).map((r) => r.trigger_key));
  const cap = body.monthlyCreditCap !== undefined ? body.monthlyCreditCap : (existingRows?.[0]?.monthly_credit_cap ?? null);
  const toAdd = keys.filter((k) => !existing.has(k));
  const toRemove = [...existing].filter((k) => !keys.includes(k));
  const createdAt = now.toISOString();

  const stmts: D1PreparedStatement[] = [];
  for (const key of toRemove) {
    for (const table of ['enterprise_trigger_grants', 'enterprise_trigger_credentials']) {
      stmts.push(
        db
          .prepare(`DELETE FROM ${table} WHERE workflow_owner_id = ? AND workflow_id = ? AND grantee_user_id = ? AND trigger_key = ?`)
          .bind(ownerId, workflowId, grantee.user_id, key),
      );
    }
  }
  for (const key of toAdd) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO enterprise_trigger_grants
             (enterprise_id, workflow_owner_id, workflow_id, grantee_user_id, trigger_key, monthly_credit_cap, granted_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(org.id, ownerId, workflowId, grantee.user_id, key, cap, identifier, createdAt),
    );
  }
  stmts.push(
    db
      .prepare(`UPDATE enterprise_trigger_grants SET monthly_credit_cap = ? WHERE workflow_owner_id = ? AND workflow_id = ? AND grantee_user_id = ?`)
      .bind(cap, ownerId, workflowId, grantee.user_id),
  );
  await db.batch(stmts);

  const credentials: Array<{ triggerKey: string; token: string }> = [];
  for (const triggerKey of toAdd) {
    const token = await issueCredential(db, { enterpriseId: org.id, ownerId, workflowId, granteeUserId: grantee.user_id, triggerKey });
    credentials.push({ triggerKey, token });
  }
  await insertEvent(db, {
    enterpriseId: org.id,
    type: 'grants_updated',
    payload: { ownerId, workflowId, granteeUserId: grantee.user_id, triggerKeys: keys, monthlyCreditCap: cap },
    actorId: identifier,
  });
  return { granteeUserId: grantee.user_id, triggerKeys: keys, monthlyCreditCap: cap, credentials };
}

/** New credential for the Business caller, or a reissue for a Pro user who already holds the key. */
export async function businessIssueCredential(
  env: Env,
  identifier: string,
  ownerId: string,
  workflowId: number,
  body: { triggerKey: string; granteeUserId?: string },
  now = new Date(),
) {
  const { db, org, triggers } = await businessOnAcceptedWorkflow(env, identifier, ownerId, workflowId, now);
  if (!triggers.some((t) => t.triggerKey === body.triggerKey)) throw new EnterpriseError('ENTERPRISE_TRIGGER_NOT_FOUND', 404);
  const granteeUserId = body.granteeUserId ?? identifier;
  if (granteeUserId !== identifier) {
    const grant = await db
      .prepare(
        `SELECT 1 FROM enterprise_trigger_grants
          WHERE enterprise_id = ? AND workflow_owner_id = ? AND workflow_id = ? AND grantee_user_id = ? AND trigger_key = ?`,
      )
      .bind(org.id, ownerId, workflowId, granteeUserId, body.triggerKey)
      .first();
    if (!grant) throw new EnterpriseError('ENTERPRISE_GRANT_NOT_FOUND', 404);
  }
  const token = await issueCredential(db, { enterpriseId: org.id, ownerId, workflowId, granteeUserId, triggerKey: body.triggerKey });
  await insertEvent(db, {
    enterpriseId: org.id,
    type: 'credential_issued',
    payload: { ownerId, workflowId, granteeUserId, triggerKey: body.triggerKey },
    actorId: identifier,
  });
  return { triggerKey: body.triggerKey, granteeUserId, token };
}

// --- Running (§3.4, §3.5) -----------------------------------------------------

export type EnterpriseRunAuth = {
  org: EnterpriseRow;
  member: MemberRow;
  workflow: Record<string, unknown>;
  trigger: EnterpriseTrigger;
  ownerId: string;
  workflowId: number;
};

function utcMonthStartMs(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
}

/** Credits that left this user's wallet for the workflow this UTC month (usage + royalty), from D1. */
export async function monthlyWorkflowCredits(env: Env, identifier: string, ownerId: string, workflowId: number, now: Date): Promise<number> {
  const consumerDoId = env.USER_DO.idFromName(identifier).toString();
  const row = await d1(env)
    .prepare(
      `SELECT COALESCE(SUM("creditsCharged"), 0) AS used FROM service_usages
        WHERE user_id = ? AND "workflowOwnerId" = ? AND "workflowId" = ? AND created_at >= ?`,
    )
    .bind(consumerDoId, ownerId, workflowId, utcMonthStartMs(now))
    .first<{ used: number }>();
  return Number(row?.used) || 0;
}

/**
 * A grant is live only while the workflow is accepted by the grant's organization, that organization
 * is active, the grantee holds an active seat there, and the key is still on the owner's graph.
 * Everything is read at call time: the owner's UserDO for the graph, D1 for seats and grants.
 */
export async function authorizeEnterpriseRun(
  env: Env,
  identifier: string,
  ownerId: string,
  workflowId: number,
  triggerKey: string,
  now = new Date(),
): Promise<EnterpriseRunAuth> {
  const db = d1(env);
  const wf = await loadOwnerWorkflow(env, ownerId, workflowId);
  const shared = wf?.isShared === true || wf?.isShared === 1;
  if (!wf || !isEnterpriseWorkflow(wf) || wf.enterpriseAcceptance !== 'accepted' || !wf.enterpriseId || !shared || wf.status !== 'published') {
    throw new EnterpriseError('ENTERPRISE_WORKFLOW_NOT_FOUND', 404);
  }
  const org = await getEnterprise(db, String(wf.enterpriseId));
  if (!org) throw new EnterpriseError('ENTERPRISE_WORKFLOW_NOT_FOUND', 404);
  if ((await refreshEnterpriseState(db, org, now)).status !== 'active') throw new EnterpriseError('ENTERPRISE_SUSPENDED', 403);

  const member = await getMembership(db, identifier);
  if (!member || member.enterprise_id !== org.id) throw new EnterpriseError('ENTERPRISE_WORKFLOW_NOT_FOUND', 404);
  if (!isActiveSeat(await loadUserRow(userDoFor(env, identifier)), member.seat_role, now)) {
    throw new EnterpriseError('ENTERPRISE_SEAT_INACTIVE', 403);
  }
  const trigger = listEnterpriseTriggers(wf.definition).find((t) => t.triggerKey === triggerKey);
  if (!trigger) throw new EnterpriseError('ENTERPRISE_TRIGGER_NOT_FOUND', 404);

  if (member.seat_role === 'pro') {
    const grant = await db
      .prepare(
        `SELECT * FROM enterprise_trigger_grants
          WHERE enterprise_id = ? AND workflow_owner_id = ? AND workflow_id = ? AND grantee_user_id = ? AND trigger_key = ?`,
      )
      .bind(org.id, ownerId, workflowId, identifier, triggerKey)
      .first<GrantRow>();
    if (!grant) throw new EnterpriseError('ENTERPRISE_TRIGGER_NOT_FOUND', 404);
    if (grant.monthly_credit_cap != null) {
      const used = await monthlyWorkflowCredits(env, identifier, ownerId, workflowId, now);
      if (used >= Number(grant.monthly_credit_cap)) throw new EnterpriseError('ENTERPRISE_CREDIT_CAP', 402);
    }
  }
  return { org, member, workflow: wf, trigger, ownerId, workflowId };
}

export type EnterpriseRunInput = {
  input?: string;
  fields?: Record<string, unknown>;
  sessionId?: string;
  chatInput?: string;
  webhook?: BuildWebhookItemParams;
};

/**
 * Runs the owner's graph from the granted node. The caller is the actor: usage and royalty come out of
 * the caller's wallet, royalty at the frozen `acceptedRoyaltyPercent`. `minPlanId` does not apply (§3.3).
 */
export async function runEnterpriseTrigger(env: Env, identifier: string, auth: EnterpriseRunAuth, run: EnterpriseRunInput) {
  const definition = parseWorkflowDefinition(auth.workflow.definition);
  const node = definition.nodes.find((n) => n.id === auth.trigger.nodeId);
  if (!node) throw new EnterpriseError('ENTERPRISE_TRIGGER_NOT_FOUND', 404);
  const base: ResolvedWorkflow = {
    workflow: { ...auth.workflow, minPlanId: 'free' },
    definition,
    ownerId: auth.ownerId,
    workflowId: auth.workflowId,
    isOwnedByUser: false,
  };
  const actor = consumerRunActor(identifier);
  const common = { env, bindingName: BINDING, ownerId: auth.ownerId, resolved: base, node, executionMode: 'production' as const, actor };

  let result: { status: string; executionKey: string; output?: unknown };
  switch (auth.trigger.kind) {
    case 'chat':
      result = await runChatTrigger({
        ...common,
        sessionId: run.sessionId || crypto.randomUUID(),
        chatInput: run.chatInput ?? run.input ?? '',
        chatUrl: '',
      });
      break;
    case 'form':
      result = await runFormSubmissionTrigger({
        ...common,
        fields: run.fields ?? {},
        formUrl: '',
        workflowId: auth.workflowId,
        formPath: resolveNodeFormPath(node),
      });
      break;
    default: {
      const binding = env.USER_DO as unknown as DurableObjectNamespace;
      result = await executeWorkflowGraph({
        c: { env } as any,
        bindingName: BINDING,
        user: { identifier },
        resolved: bindResolvedToActor(base, actor, binding),
        input: run.input ?? '',
        requestMeta: { userAgent: `enterprise:${auth.trigger.kind}` },
        entryNodeIds: [node.id],
        webhookItem: auth.trigger.kind === 'webhook' ? (run.webhook ?? { webhookUrl: '', body: run.fields ?? run.input ?? {}, executionMode: 'production' }) : undefined,
        triggerKind: auth.trigger.kind === 'webhook' ? 'webhook' : 'manual',
      });
    }
  }
  return { status: result.status, executionKey: result.executionKey, output: result.output };
}

/** `POST /dashboard/build/workflows/enterprise/:ownerId/:workflowId/execute` with the session user. */
export async function sessionExecute(
  env: Env,
  identifier: string,
  ownerId: string,
  workflowId: number,
  body: { triggerKey: string } & EnterpriseRunInput,
) {
  const auth = await authorizeEnterpriseRun(env, identifier, ownerId, workflowId, body.triggerKey);
  return runEnterpriseTrigger(env, identifier, auth, body);
}

/**
 * `POST /hooks/workflows/:workflowId/:path?owner_id=`. Auth is the caller's API token
 * (`Authorization: Bearer` + `X-Client-ID`), same as a community webhook. The grant still decides
 * whether this member may run the trigger.
 */
export async function runEnterpriseWebhookCall(
  env: Env,
  identifier: string,
  ownerId: string,
  workflowId: number,
  webhookPath: string | undefined,
  request: Request,
) {
  const wf = await loadOwnerWorkflow(env, ownerId, workflowId);
  if (!wf || !isEnterpriseWorkflow(wf)) throw new EnterpriseError('ENTERPRISE_WORKFLOW_NOT_FOUND', 404);
  const triggers = listEnterpriseTriggers(wf.definition).filter((t) => t.kind === 'webhook');
  const path = webhookPath?.trim().replace(/^\/+/, '');
  const trigger = path
    ? triggers.find((t) => t.webhookPath === path || t.nodeId === path)
    : triggers.length === 1
      ? triggers[0]
      : undefined;
  if (!trigger) throw new EnterpriseError('ENTERPRISE_TRIGGER_NOT_FOUND', 404);

  const auth = await authorizeEnterpriseRun(env, identifier, ownerId, workflowId, trigger.triggerKey);
  const { input, itemParams } = await parseWebhookRequest(request, { input: null }, { executionMode: 'production' });
  const body = itemParams.body;
  const record = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : undefined;
  return runEnterpriseTrigger(env, identifier, auth, {
    input,
    fields: record,
    sessionId: typeof record?.sessionId === 'string' ? record.sessionId : undefined,
    chatInput: resolveWebhookQuestion(body) || input,
    webhook: itemParams,
  });
}

/** `POST /hooks/enterprise/:token`. The token stands for one user and one key; a bad or revoked token is 404. */
export async function credentialHook(env: Env, token: string, request: Request) {
  if (!/^ent_[A-Za-z0-9_-]{20,100}$/.test(token)) throw new EnterpriseError('ENTERPRISE_CREDENTIAL_NOT_FOUND', 404);
  const cred = await d1(env)
    .prepare(`SELECT * FROM enterprise_trigger_credentials WHERE token_hash = ?`)
    .bind(await sha256Hex(token))
    .first<{ enterprise_id: string; workflow_owner_id: string; workflow_id: number; grantee_user_id: string; trigger_key: string }>();
  if (!cred) throw new EnterpriseError('ENTERPRISE_CREDENTIAL_NOT_FOUND', 404);

  const auth = await authorizeEnterpriseRun(env, cred.grantee_user_id, cred.workflow_owner_id, Number(cred.workflow_id), cred.trigger_key);
  if (auth.org.id !== cred.enterprise_id) throw new EnterpriseError('ENTERPRISE_CREDENTIAL_NOT_FOUND', 404);

  const { input, itemParams } = await parseWebhookRequest(request, { input: null }, { executionMode: 'production' });
  const body = itemParams.body;
  const record = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : undefined;
  return runEnterpriseTrigger(env, cred.grantee_user_id, auth, {
    input,
    fields: record,
    sessionId: typeof record?.sessionId === 'string' ? record.sessionId : undefined,
    chatInput: resolveWebhookQuestion(body) || input,
    webhook: itemParams,
  });
}
