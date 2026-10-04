import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const doWorkflows = new Map<string, Record<string, unknown>>();
const doUsers = new Map<string, Record<string, unknown>>();
const rowKey = (ownerId: string, id: unknown) => `${ownerId}:${Number(id)}`;
const runs: Array<{ runner: string; params: any }> = [];

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
      throw new Error(`unexpected ${action} ${table}`);
    }),
  },
}));

vi.mock('../member/workflows/execution/workflow-context', () => ({
  parseWorkflowDefinition: (raw: string) => JSON.parse(raw),
}));
vi.mock('../member/workflows/engine/executor', () => ({
  executeWorkflowGraph: vi.fn(async (params: any) => {
    runs.push({ runner: 'graph', params });
    return { status: 'completed', executionKey: 'ek-graph', output: { ok: true } };
  }),
}));
vi.mock('../member/workflows/triggers/chat-submission', () => ({
  runChatTrigger: vi.fn(async (params: any) => {
    runs.push({ runner: 'chat', params });
    return { status: 'completed', executionKey: 'ek-chat', output: 'hi' };
  }),
}));
vi.mock('../member/workflows/triggers/form-submission', () => ({
  resolveNodeFormPath: (node: { id: string }) => node.id,
  runFormSubmissionTrigger: vi.fn(async (params: any) => {
    runs.push({ runner: 'form', params });
    return { status: 'running', executionKey: 'ek-form' };
  }),
}));

import {
  authorizeEnterpriseRun,
  businessIssueCredential,
  businessListGrants,
  businessPutGrants,
  credentialHook,
  sessionExecute,
} from './triggers';
import { enterpriseCatalog } from './workflow-proposal';
import { enterpriseSqlite, fakeD1 } from './test-d1';

const NOW = new Date('2026-10-04T00:00:00.000Z');
const FUTURE = '2026-12-01T00:00:00.000Z';
const OWNER = 'owner@x';
const BIZ = 'biz@x';
const PRO = 'pro@x';
const PRO2 = 'pro2@x';
const IDS: Record<string, string> = { [OWNER]: 'a'.repeat(64), [BIZ]: 'b'.repeat(64), [PRO]: 'c'.repeat(64), [PRO2]: 'e'.repeat(64) };
const OWNER_ID = IDS[OWNER];
const WF = 3;
const CHAT_KEY = '11111111-1111-4111-8111-111111111111';
const FORM_KEY = '22222222-2222-4222-8222-222222222222';
const HOOK_KEY = '33333333-3333-4333-8333-333333333333';

let sqlite: DatabaseSync;
let env: Env;

const seat = (planId: 'pro' | 'business') => ({ planId, planSource: 'enterprise', planStatus: 'active', planCurrentPeriodEnd: FUTURE });
const definition = (nodes = ['chat', 'form', 'webhook']) =>
  JSON.stringify({
    nodes: [
      nodes.includes('chat') && { id: 'n-chat', type: 'trigger', data: { triggerKind: 'chat', label: 'Ask', enterpriseTriggerKey: CHAT_KEY } },
      nodes.includes('form') && { id: 'n-form', type: 'trigger', data: { triggerKind: 'form', label: 'Intake', enterpriseTriggerKey: FORM_KEY } },
      nodes.includes('webhook') && { id: 'n-hook', type: 'core', data: { coreKind: 'webhook', label: 'Hook', enterpriseTriggerKey: HOOK_KEY } },
    ].filter(Boolean),
    edges: [],
  });
const workflow = () => doWorkflows.get(rowKey(OWNER_ID, WF))!;

function flush() {
  const wf = workflow();
  sqlite.exec(`DELETE FROM agent_workflows`);
  sqlite
    .prepare(
      `INSERT INTO agent_workflows VALUES (?, ?, ?, '', '[]', ?, ?, 1, ?, ?, ?, 1, ?)`,
    )
    .run(WF, OWNER_ID, String(wf.name), String(wf.status), wf.isShared ? 1 : 0, String(wf.enterpriseId), String(wf.enterpriseAcceptance), 5, String(wf.definition));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  runs.length = 0;
  doWorkflows.clear();
  doUsers.clear();
  sqlite = enterpriseSqlite();
  sqlite.exec(`CREATE TABLE users (user_id TEXT, identifier TEXT)`);
  sqlite.exec(`CREATE TABLE agent_workflows (id INTEGER, user_id TEXT, name TEXT, description TEXT, tags TEXT, status TEXT,
    isShared INTEGER, isEnterprise INTEGER, enterpriseId TEXT, enterpriseAcceptance TEXT, acceptedRoyaltyPercent REAL, updated_at INTEGER, definition TEXT)`);
  sqlite.exec(`CREATE TABLE service_usages (user_id TEXT, workflowOwnerId TEXT, workflowId INTEGER, creditsCharged REAL, created_at INTEGER)`);
  for (const [identifier, id] of Object.entries(IDS)) sqlite.prepare(`INSERT INTO users VALUES (?, ?)`).run(id, identifier);
  sqlite
    .prepare(
      `INSERT INTO enterprises (id, name, min_pro_seats, status, admin_hold, period_end, created_at, updated_at)
       VALUES ('org-1', 'ACME', 1, 'active', 0, ?, '2026-01-01', '2026-01-01')`,
    )
    .run(FUTURE);
  for (const [user, role] of [[BIZ, 'business'], [PRO, 'pro'], [PRO2, 'pro']]) {
    sqlite.prepare(`INSERT INTO enterprise_members VALUES ('org-1', ?, ?, '2026-01-01')`).run(user, role);
  }
  doUsers.set(IDS[BIZ], seat('business'));
  doUsers.set(IDS[PRO], seat('pro'));
  doUsers.set(IDS[PRO2], seat('pro'));
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
    name: 'Support desk',
    status: 'published',
    isShared: true,
    isEnterprise: true,
    enterpriseId: 'org-1',
    enterpriseAcceptance: 'accepted',
    acceptedRoyaltyPercent: 5,
    definition: definition(),
  });
});

const grant = (grantee: string, keys: string[], cap?: number | null) =>
  businessPutGrants(env, BIZ, OWNER_ID, WF, { granteeUserId: grantee, triggerKeys: keys, monthlyCreditCap: cap });

describe('grants', () => {
  it('writes one row per key, returns each new plaintext token once and stores only a hash', async () => {
    const res = await grant(PRO, [CHAT_KEY, FORM_KEY], 50);
    expect(res.credentials.map((c) => c.triggerKey).sort()).toEqual([CHAT_KEY, FORM_KEY].sort());
    expect(res.credentials[0].token).toMatch(/^ent_/);
    const stored = sqlite.prepare(`SELECT token_hash FROM enterprise_trigger_credentials`).all() as any[];
    expect(stored).toHaveLength(2);
    expect(stored.map((r) => r.token_hash)).not.toContain(res.credentials[0].token);

    const again = await grant(PRO, [CHAT_KEY]);
    expect(again.credentials).toEqual([]);
    expect(again.monthlyCreditCap).toBe(50);
    const list = await businessListGrants(env, BIZ, OWNER_ID, WF);
    expect(list.grants).toEqual([{ granteeUserId: PRO, triggerKey: CHAT_KEY, monthlyCreditCap: 50, hasCredential: true }]);
    expect(list.proMembers.sort()).toEqual([PRO, PRO2].sort());
    expect(list).not.toHaveProperty('token');
  });

  it('an empty list revokes grants and credentials of that user', async () => {
    await grant(PRO, [CHAT_KEY]);
    await grant(PRO, []);
    expect(sqlite.prepare(`SELECT COUNT(*) AS n FROM enterprise_trigger_grants`).get()).toMatchObject({ n: 0 });
    expect(sqlite.prepare(`SELECT COUNT(*) AS n FROM enterprise_trigger_credentials`).get()).toMatchObject({ n: 0 });
  });

  it('rejects keys not on the graph, non-Pro grantees, and Pro callers', async () => {
    await expect(grant(PRO, ['44444444-4444-4444-8444-444444444444'])).rejects.toMatchObject({ code: 'ENTERPRISE_TRIGGER_NOT_FOUND' });
    await expect(grant(BIZ, [CHAT_KEY])).rejects.toMatchObject({ code: 'ENTERPRISE_GRANTEE_NOT_PRO' });
    await expect(
      businessPutGrants(env, PRO, OWNER_ID, WF, { granteeUserId: PRO2, triggerKeys: [CHAT_KEY] }),
    ).rejects.toMatchObject({ code: 'ENTERPRISE_BUSINESS_ONLY' });
  });

  it('needs a workflow the organization accepted', async () => {
    workflow().enterpriseAcceptance = 'pending';
    await expect(grant(PRO, [CHAT_KEY])).rejects.toMatchObject({ status: 404 });
  });

  it('reissuing replaces the old token', async () => {
    const { credentials } = await grant(PRO, [HOOK_KEY]);
    const reissued = await businessIssueCredential(env, BIZ, OWNER_ID, WF, { triggerKey: HOOK_KEY, granteeUserId: PRO });
    await expect(credentialHook(env, credentials[0].token, new Request('https://x/'))).rejects.toMatchObject({ status: 404 });
    await expect(credentialHook(env, reissued.token, new Request('https://x/', { method: 'POST', body: '{}' }))).resolves.toMatchObject({
      executionKey: 'ek-graph',
    });
  });
});

describe('who may run', () => {
  it('Business runs any key on the graph; Pro only the keys granted', async () => {
    await expect(authorizeEnterpriseRun(env, BIZ, OWNER_ID, WF, FORM_KEY)).resolves.toBeTruthy();
    await expect(authorizeEnterpriseRun(env, PRO, OWNER_ID, WF, CHAT_KEY)).rejects.toMatchObject({ status: 404 });
    await grant(PRO, [CHAT_KEY]);
    await expect(authorizeEnterpriseRun(env, PRO, OWNER_ID, WF, CHAT_KEY)).resolves.toBeTruthy();
    await expect(authorizeEnterpriseRun(env, PRO, OWNER_ID, WF, FORM_KEY)).rejects.toMatchObject({ status: 404 });
  });

  it('a key removed from the graph stops working', async () => {
    await grant(PRO, [CHAT_KEY]);
    workflow().definition = definition(['form']);
    await expect(authorizeEnterpriseRun(env, PRO, OWNER_ID, WF, CHAT_KEY)).rejects.toMatchObject({ code: 'ENTERPRISE_TRIGGER_NOT_FOUND' });
  });

  it('a suspended organization answers 403 and keeps the grant', async () => {
    await grant(PRO, [CHAT_KEY]);
    sqlite.exec(`UPDATE enterprises SET admin_hold = 1`);
    await expect(authorizeEnterpriseRun(env, PRO, OWNER_ID, WF, CHAT_KEY)).rejects.toMatchObject({ code: 'ENTERPRISE_SUSPENDED', status: 403 });
    sqlite.exec(`UPDATE enterprises SET admin_hold = 0`);
    await expect(authorizeEnterpriseRun(env, PRO, OWNER_ID, WF, CHAT_KEY)).resolves.toBeTruthy();
  });

  it('an inactive seat cannot run', async () => {
    await grant(PRO, [CHAT_KEY]);
    doUsers.set(IDS[PRO], { ...seat('pro'), planCurrentPeriodEnd: '2026-01-01T00:00:00.000Z' });
    await expect(authorizeEnterpriseRun(env, PRO, OWNER_ID, WF, CHAT_KEY)).rejects.toMatchObject({ code: 'ENTERPRISE_SEAT_INACTIVE' });
  });

  it('the monthly cap counts usage and royalty of this UTC month → 402', async () => {
    await grant(PRO, [CHAT_KEY], 10);
    const insert = sqlite.prepare(`INSERT INTO service_usages VALUES (?, ?, ?, ?, ?)`);
    insert.run(IDS[PRO], OWNER_ID, WF, 9, Date.UTC(2026, 8, 30));
    insert.run(IDS[PRO], OWNER_ID, WF, 6, Date.UTC(2026, 9, 2));
    await expect(authorizeEnterpriseRun(env, PRO, OWNER_ID, WF, CHAT_KEY)).resolves.toBeTruthy();
    insert.run(IDS[PRO], OWNER_ID, WF, 4, Date.UTC(2026, 9, 3));
    await expect(authorizeEnterpriseRun(env, PRO, OWNER_ID, WF, CHAT_KEY)).rejects.toMatchObject({ code: 'ENTERPRISE_CREDIT_CAP', status: 402 });
  });
});

describe('running', () => {
  it('session execute runs the granted node as the caller with minPlanId lifted', async () => {
    await grant(PRO, [CHAT_KEY]);
    workflow().minPlanId = 'business';
    const res = await sessionExecute(env, PRO, OWNER_ID, WF, { triggerKey: CHAT_KEY, chatInput: 'hello' });
    expect(res).toMatchObject({ status: 'completed', executionKey: 'ek-chat' });
    const { params } = runs[0];
    expect(runs[0].runner).toBe('chat');
    expect(params.node.id).toBe('n-chat');
    expect(params.chatInput).toBe('hello');
    expect(params.actor).toMatchObject({ identifier: PRO });
    expect(params.resolved).toMatchObject({ ownerId: OWNER_ID, isOwnedByUser: false, workflow: { minPlanId: 'free' } });
  });

  it('a token runs exactly its key with the request body', async () => {
    const { token } = await businessIssueCredential(env, BIZ, OWNER_ID, WF, { triggerKey: FORM_KEY });
    await credentialHook(
      env,
      token,
      new Request('https://x/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"name":"Ann"}' }),
    );
    expect(runs[0]).toMatchObject({ runner: 'form', params: { fields: { name: 'Ann' }, actor: { identifier: BIZ } } });
  });

  it('a malformed or unknown token is 404; a suspended organization is 403', async () => {
    await expect(credentialHook(env, 'nope', new Request('https://x/'))).rejects.toMatchObject({ status: 404 });
    await expect(credentialHook(env, `ent_${'a'.repeat(43)}`, new Request('https://x/'))).rejects.toMatchObject({ status: 404 });
    const { token } = await businessIssueCredential(env, BIZ, OWNER_ID, WF, { triggerKey: HOOK_KEY });
    sqlite.exec(`UPDATE enterprises SET admin_hold = 1`);
    await expect(credentialHook(env, token, new Request('https://x/', { method: 'POST' }))).rejects.toMatchObject({
      code: 'ENTERPRISE_SUSPENDED',
      status: 403,
    });
  });
});

describe('organization block triggers', () => {
  it('Business sees every key; Pro only granted keys, and a new key does not appear for Pro', async () => {
    await grant(PRO, [CHAT_KEY, FORM_KEY]);
    flush();
    const biz = await enterpriseCatalog(env, BIZ);
    expect(biz.workflows[0].triggers.map((t) => t.kind)).toEqual(['chat', 'form', 'webhook']);
    const pro = await enterpriseCatalog(env, PRO);
    expect(pro.workflows[0].triggers.map((t) => t.triggerKey)).toEqual([CHAT_KEY, FORM_KEY]);
    expect(JSON.stringify(pro)).not.toMatch(/ent_|definition/);
    expect((await enterpriseCatalog(env, PRO2)).workflows).toEqual([]);
  });

  it('Pro loses the card when every granted key left the graph', async () => {
    await grant(PRO, [CHAT_KEY]);
    workflow().definition = definition(['form']);
    flush();
    expect((await enterpriseCatalog(env, PRO)).workflows).toEqual([]);
  });
});
