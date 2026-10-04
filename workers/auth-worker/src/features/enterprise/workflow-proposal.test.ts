import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const doWorkflows = new Map<string, Record<string, unknown>>();
const doUsers = new Map<string, Record<string, unknown>>();
const platformRoyalty = { percent: 5 };
const rowKey = (ownerId: string, id: unknown) => `${ownerId}:${Number(id)}`;

vi.mock('../../shared/utils', () => ({
  executeUtils: {
    executeDynamicAction: vi.fn(async (stub: { ownerId: string }, action: string, payload: any, table: string) => {
      if (table === 'users') {
        const u = doUsers.get(stub.ownerId);
        return u ? [{ id: 1, ...u }] : [];
      }
      if (action === 'select') {
        const row = doWorkflows.get(rowKey(stub.ownerId, payload.where.value));
        return row ? [{ ...row }] : [];
      }
      if (action === 'update') {
        const key = rowKey(stub.ownerId, payload.id);
        const existing = doWorkflows.get(key);
        if (!existing) throw new Error(`No record found with id: ${payload.id}`);
        doWorkflows.set(key, { ...existing, ...payload });
        return doWorkflows.get(key);
      }
      throw new Error(`unexpected ${action} ${table}`);
    }),
  },
}));

vi.mock('../member/workflows/billing/get-royalty-percent', () => ({
  getWorkflowRoyaltyPercentFromEnv: vi.fn(async () => platformRoyalty.percent),
}));

import { adminListEnterpriseWorkflows, frozenEnterpriseRoyaltyPercent } from './workflow-flag';
import { businessDecideProposal, enterpriseCatalog, ownerSetEnterpriseProposal } from './workflow-proposal';
import { enterpriseSqlite, fakeD1 } from './test-d1';

const NOW = new Date('2026-10-04T00:00:00.000Z');
const FUTURE = '2026-12-01T00:00:00.000Z';
const OWNER = 'owner@x';
const BIZ = 'biz@x';
const PRO = 'pro@x';
const OUTSIDER = 'outsider@x';
const IDS: Record<string, string> = { [OWNER]: 'a'.repeat(64), [BIZ]: 'b'.repeat(64), [PRO]: 'c'.repeat(64), [OUTSIDER]: 'd'.repeat(64) };
const OWNER_ID = IDS[OWNER];
const WF = 3;

let sqlite: DatabaseSync;
let env: Env;

const seat = (planId: 'pro' | 'business') => ({
  planId,
  planSource: 'enterprise',
  planStatus: 'active',
  planCurrentPeriodEnd: FUTURE,
});

function addOrg(id: string, periodEnd: string | null, adminHold = 0) {
  sqlite
    .prepare(
      `INSERT INTO enterprises (id, name, min_pro_seats, status, admin_hold, period_end, created_at, updated_at)
       VALUES (?, ?, 1, 'active', ?, ?, '2026-01-01', '2026-01-01')`,
    )
    .run(id, id, adminHold, periodEnd);
}

/** Mirror the owner DO row into the D1 projection, as the queue would after a flush. */
function flush() {
  const wf = doWorkflows.get(rowKey(OWNER_ID, WF))!;
  sqlite.exec(`DELETE FROM agent_workflows`);
  sqlite
    .prepare(
      `INSERT INTO agent_workflows (id, user_id, name, description, tags, status, isShared, isEnterprise,
         enterpriseId, enterpriseAcceptance, acceptedRoyaltyPercent, updated_at, definition)
       VALUES (?, ?, ?, ?, '[]', ?, ?, ?, ?, ?, ?, 1, ?)`,
    )
    .run(
      WF,
      OWNER_ID,
      String(wf.name),
      String(wf.description ?? ''),
      String(wf.status),
      wf.isShared ? 1 : 0,
      wf.isEnterprise ? 1 : 0,
      (wf.enterpriseId as string | null) ?? null,
      String(wf.enterpriseAcceptance ?? 'none'),
      (wf.acceptedRoyaltyPercent as number | null) ?? null,
      String(wf.definition ?? ''),
    );
}

const workflow = () => doWorkflows.get(rowKey(OWNER_ID, WF))!;
const events = () => sqlite.prepare(`SELECT type FROM enterprise_events ORDER BY rowid`).all().map((r: any) => r.type);
const grantCount = () => Number((sqlite.prepare(`SELECT COUNT(*) AS n FROM enterprise_trigger_grants`).get() as any).n);

function addGrant(grantee: string, org = 'org-1') {
  sqlite
    .prepare(`INSERT INTO enterprise_trigger_grants VALUES (?, ?, ?, ?, 'chat', NULL, ?, '2026-01-01')`)
    .run(org, OWNER_ID, WF, grantee, BIZ);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  doWorkflows.clear();
  doUsers.clear();
  platformRoyalty.percent = 5;
  sqlite = enterpriseSqlite();
  sqlite.exec(`CREATE TABLE users (user_id TEXT, identifier TEXT)`);
  sqlite.exec(`CREATE TABLE agent_workflows (id INTEGER, user_id TEXT, name TEXT, description TEXT, tags TEXT, status TEXT,
    isShared INTEGER, isEnterprise INTEGER, enterpriseId TEXT, enterpriseAcceptance TEXT, acceptedRoyaltyPercent REAL, updated_at INTEGER, definition TEXT)`);
  for (const [identifier, id] of Object.entries(IDS)) sqlite.prepare(`INSERT INTO users VALUES (?, ?)`).run(id, identifier);
  addOrg('org-1', FUTURE);
  addOrg('org-2', FUTURE);
  addOrg('org-unpaid', null);
  sqlite.prepare(`INSERT INTO enterprise_members VALUES ('org-1', ?, 'business', '2026-01-01')`).run(BIZ);
  sqlite.prepare(`INSERT INTO enterprise_members VALUES ('org-1', ?, 'pro', '2026-01-01')`).run(PRO);
  doUsers.set(IDS[BIZ], seat('business'));
  doUsers.set(IDS[PRO], seat('pro'));
  env = {
    D1DB: fakeD1(sqlite),
    USER_DO: {
      idFromName: (name: string) => ({ toString: () => IDS[name] ?? 'f'.repeat(64) }),
      idFromString: (id: string) => id,
      get: (id: any) => ({ ownerId: typeof id === 'string' ? id : id.toString() }),
    },
  } as unknown as Env;
  doWorkflows.set(rowKey(OWNER_ID, WF), {
    id: WF,
    name: 'Payroll',
    description: 'Monthly payroll',
    definition: JSON.stringify({ nodes: [{ id: 'n1', type: 'trigger', data: { triggerKind: 'chat', enterpriseTriggerKey: 'chat' } }], edges: [] }),
    status: 'published',
    isShared: true,
    isEnterprise: true,
    enterpriseAcceptance: 'none',
  });
});

describe('owner proposal', () => {
  it('needs the enterprise flag', async () => {
    workflow().isEnterprise = false;
    await expect(ownerSetEnterpriseProposal(env, OWNER, WF, 'org-1')).rejects.toMatchObject({ code: 'ENTERPRISE_FLAG_REQUIRED', status: 403 });
  });

  it('needs an existing, active organization', async () => {
    await expect(ownerSetEnterpriseProposal(env, OWNER, WF, 'nope')).rejects.toMatchObject({ status: 404 });
    await expect(ownerSetEnterpriseProposal(env, OWNER, WF, 'org-unpaid')).rejects.toMatchObject({ code: 'ENTERPRISE_NOT_ACTIVE' });
    sqlite.exec(`UPDATE enterprises SET admin_hold = 1 WHERE id = 'org-2'`);
    await expect(ownerSetEnterpriseProposal(env, OWNER, WF, 'org-2')).rejects.toMatchObject({ code: 'ENTERPRISE_NOT_ACTIVE' });
  });

  it('goes pending with the platform royalty of the moment and clears old grants', async () => {
    addGrant(PRO);
    await ownerSetEnterpriseProposal(env, OWNER, WF, 'org-1');
    expect(workflow()).toMatchObject({ enterpriseId: 'org-1', enterpriseAcceptance: 'pending', acceptedRoyaltyPercent: 5 });
    expect(grantCount()).toBe(0);
    expect(events()).toEqual(['proposal_sent']);
  });

  it('switching organization while pending re-proposes; withdrawing clears it', async () => {
    await ownerSetEnterpriseProposal(env, OWNER, WF, 'org-1');
    await ownerSetEnterpriseProposal(env, OWNER, WF, 'org-2');
    expect(workflow()).toMatchObject({ enterpriseId: 'org-2', enterpriseAcceptance: 'pending' });
    await ownerSetEnterpriseProposal(env, OWNER, WF, null);
    expect(workflow()).toMatchObject({ enterpriseId: null, enterpriseAcceptance: 'none', acceptedRoyaltyPercent: null });
    expect(events()).toEqual(['proposal_sent', 'proposal_withdrawn', 'proposal_sent', 'proposal_withdrawn']);
  });

  it('cannot withdraw or move an accepted workflow', async () => {
    Object.assign(workflow(), { enterpriseId: 'org-1', enterpriseAcceptance: 'accepted', acceptedRoyaltyPercent: 5 });
    await expect(ownerSetEnterpriseProposal(env, OWNER, WF, null)).rejects.toMatchObject({ code: 'ENTERPRISE_ACCEPTED', status: 409 });
    await expect(ownerSetEnterpriseProposal(env, OWNER, WF, 'org-2')).rejects.toMatchObject({ code: 'ENTERPRISE_ACCEPTED' });
  });
});

describe('business decision', () => {
  beforeEach(async () => {
    await ownerSetEnterpriseProposal(env, OWNER, WF, 'org-1');
  });

  it('accept freezes the royalty offered on the proposal, not the rate at click time', async () => {
    platformRoyalty.percent = 12;
    await businessDecideProposal(env, BIZ, OWNER_ID, WF, 'accept');
    expect(workflow()).toMatchObject({ enterpriseAcceptance: 'accepted', acceptedRoyaltyPercent: 5 });
    expect(frozenEnterpriseRoyaltyPercent(workflow())).toBe(5);
    expect(events()).toContain('proposal_accepted');
  });

  it('only a Business seat of that organization decides', async () => {
    await expect(businessDecideProposal(env, PRO, OWNER_ID, WF, 'accept')).rejects.toMatchObject({ code: 'ENTERPRISE_BUSINESS_ONLY' });
    await expect(businessDecideProposal(env, OUTSIDER, OWNER_ID, WF, 'accept')).rejects.toMatchObject({ code: 'ENTERPRISE_NOT_MEMBER' });
    sqlite.prepare(`INSERT INTO enterprise_members VALUES ('org-2', ?, 'business', '2026-01-01')`).run(OUTSIDER);
    await expect(businessDecideProposal(env, OUTSIDER, OWNER_ID, WF, 'accept')).rejects.toMatchObject({ status: 404 });
  });

  it('accept needs an active seat and an active organization', async () => {
    doUsers.set(IDS[BIZ], { ...seat('business'), planSource: 'paypal' });
    await expect(businessDecideProposal(env, BIZ, OWNER_ID, WF, 'accept')).rejects.toMatchObject({ code: 'ENTERPRISE_SEAT_INACTIVE' });
    doUsers.set(IDS[BIZ], seat('business'));
    sqlite.exec(`UPDATE enterprises SET admin_hold = 1 WHERE id = 'org-1'`);
    await expect(businessDecideProposal(env, BIZ, OWNER_ID, WF, 'accept')).rejects.toMatchObject({ code: 'ENTERPRISE_NOT_ACTIVE' });
  });

  it('reject clears the proposal; release only applies to accepted workflows and clears grants', async () => {
    await expect(businessDecideProposal(env, BIZ, OWNER_ID, WF, 'release')).rejects.toMatchObject({ code: 'ENTERPRISE_NOT_ACCEPTED' });
    await businessDecideProposal(env, BIZ, OWNER_ID, WF, 'reject');
    expect(workflow()).toMatchObject({ enterpriseId: null, enterpriseAcceptance: 'none', isEnterprise: true });

    await ownerSetEnterpriseProposal(env, OWNER, WF, 'org-1');
    await businessDecideProposal(env, BIZ, OWNER_ID, WF, 'accept');
    addGrant(PRO);
    await businessDecideProposal(env, BIZ, OWNER_ID, WF, 'release');
    expect(workflow()).toMatchObject({ enterpriseId: null, enterpriseAcceptance: 'none', acceptedRoyaltyPercent: null, isEnterprise: true });
    expect(grantCount()).toBe(0);
    expect(events().slice(-1)).toEqual(['workflow_released']);
  });
});

describe('organization block', () => {
  it('Business sees pending proposals with the royalty, then the accepted workflow', async () => {
    await ownerSetEnterpriseProposal(env, OWNER, WF, 'org-1');
    flush();
    const before = await enterpriseCatalog(env, BIZ);
    expect(before.workflows).toEqual([]);
    expect(before.proposals).toEqual([expect.objectContaining({ id: WF, ownerId: OWNER_ID, ownerIdentifier: OWNER, royaltyPercent: 5 })]);

    await businessDecideProposal(env, BIZ, OWNER_ID, WF, 'accept');
    flush();
    const after = await enterpriseCatalog(env, BIZ);
    expect(after.workflows).toEqual([expect.objectContaining({ id: WF, name: 'Payroll' })]);
    expect(after.proposals).toEqual([]);
    expect(after.workflows[0]).not.toHaveProperty('definition');
  });

  it('Pro sees nothing until granted; outsiders and suspended organizations see nothing', async () => {
    await ownerSetEnterpriseProposal(env, OWNER, WF, 'org-1');
    await businessDecideProposal(env, BIZ, OWNER_ID, WF, 'accept');
    flush();
    const ungranted = await enterpriseCatalog(env, PRO);
    expect(ungranted).toMatchObject({ workflows: [], proposals: [] });
    expect(ungranted.enterprise).toMatchObject({ seatRole: 'pro', status: 'active', seatActive: true });
    expect(ungranted.enterprise).not.toHaveProperty('id');
    addGrant(PRO);
    expect((await enterpriseCatalog(env, PRO)).workflows).toHaveLength(1);
    expect(await enterpriseCatalog(env, OUTSIDER)).toEqual({ enterprise: null, workflows: [], proposals: [] });

    sqlite.exec(`UPDATE enterprises SET admin_hold = 1 WHERE id = 'org-1'`);
    expect(await enterpriseCatalog(env, PRO)).toMatchObject({ workflows: [], proposals: [] });
    const held = await enterpriseCatalog(env, BIZ);
    expect(held).toMatchObject({ workflows: [], proposals: [] });
    expect(held.enterprise).toMatchObject({ id: 'org-1', seatRole: 'business', status: 'suspended' });
  });

  it('admin list shows flagged workflows with their organization and acceptance', async () => {
    flush();
    expect(await adminListEnterpriseWorkflows(env)).toMatchObject([{ workflowId: WF, enterpriseId: null, enterpriseAcceptance: 'none' }]);
    await ownerSetEnterpriseProposal(env, OWNER, WF, 'org-1');
    flush();
    expect(await adminListEnterpriseWorkflows(env)).toMatchObject([
      { ownerId: OWNER_ID, ownerIdentifier: OWNER, workflowId: WF, enterpriseId: 'org-1', enterpriseName: 'org-1', enterpriseAcceptance: 'pending' },
    ]);
  });

  it('hides accepted workflows the owner unshared', async () => {
    await ownerSetEnterpriseProposal(env, OWNER, WF, 'org-1');
    await businessDecideProposal(env, BIZ, OWNER_ID, WF, 'accept');
    workflow().isShared = false;
    flush();
    expect((await enterpriseCatalog(env, BIZ)).workflows).toEqual([]);
  });
});
