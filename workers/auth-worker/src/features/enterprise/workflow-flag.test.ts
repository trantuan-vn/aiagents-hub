import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const doRows = new Map<string, Record<string, unknown>>();
const rowKey = (ownerId: string, id: unknown) => `${ownerId}:${Number(id)}`;

vi.mock('../../shared/utils', () => ({
  executeUtils: {
    executeDynamicAction: vi.fn(async (stub: { ownerId: string }, action: string, payload: any) => {
      if (action === 'select') {
        const row = doRows.get(rowKey(stub.ownerId, payload.where.value));
        return row ? [{ ...row }] : [];
      }
      if (action === 'update') {
        const key = rowKey(stub.ownerId, payload.id);
        const existing = doRows.get(key);
        if (!existing) throw new Error(`No record found with id: ${payload.id}`);
        doRows.set(key, { ...existing, ...payload });
        return doRows.get(key);
      }
      throw new Error(`unexpected action ${action}`);
    }),
  },
}));

import {
  adminApproveFlagRequest,
  adminListFlagRequests,
  adminRejectFlagRequest,
  adminSetWorkflowFlag,
  assertPublicSharedOnOwnerDo,
  beforeOwnerDeletesWorkflow,
  isEnterpriseWorkflow,
  ownerLatestFlagRequest,
  ownerRequestFlag,
  ownerWithdrawFlag,
} from './workflow-flag';

const MIGRATIONS = ['019_enterprise.sql', '021_enterprise_flag_request_one_pending.sql'].map((f) =>
  readFileSync(new URL(`../../../../queue-worker/migrations/${f}`, import.meta.url), 'utf8'),
);

function fakeD1(sqlite: DatabaseSync): D1Database {
  const statement = (sql: string, params: unknown[] = []) => ({
    sql,
    params,
    bind: (...next: unknown[]) => statement(sql, next),
    run: async () => {
      const r = sqlite.prepare(sql).run(...(params as any[]));
      return { meta: { changes: Number(r.changes) } };
    },
    first: async () => sqlite.prepare(sql).get(...(params as any[])) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...(params as any[])) }),
  });
  return {
    prepare: (sql: string) => statement(sql),
    batch: async (stmts: any[]) => {
      sqlite.exec('BEGIN');
      try {
        const out = [];
        for (const s of stmts) out.push(await s.run());
        sqlite.exec('COMMIT');
        return out;
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
    },
  } as unknown as D1Database;
}

const ALICE = 'alice@example.com';
const ALICE_ID = 'a'.repeat(64);
const WF = 7;

let sqlite: DatabaseSync;
let env: Env;

beforeEach(() => {
  doRows.clear();
  sqlite = new DatabaseSync(':memory:');
  for (const m of MIGRATIONS) sqlite.exec(m);
  sqlite.exec(`CREATE TABLE users (user_id TEXT, identifier TEXT)`);
  sqlite.prepare(`INSERT INTO users VALUES (?, ?)`).run(ALICE_ID, ALICE);
  env = {
    D1DB: fakeD1(sqlite),
    USER_DO: {
      idFromName: (name: string) => ({ toString: () => (name === ALICE ? ALICE_ID : 'f'.repeat(64)) }),
      idFromString: (id: string) => id,
      get: (id: string) => ({ ownerId: id }),
    },
  } as unknown as Env;
  doRows.set(rowKey(ALICE_ID, WF), {
    id: WF,
    name: 'Invoice bot',
    definition: '{"nodes":[],"edges":[]}',
    status: 'published',
    isShared: true,
    isEnterprise: false,
    enterpriseAcceptance: 'none',
  });
});

const workflow = () => doRows.get(rowKey(ALICE_ID, WF))!;
const requestStatuses = () =>
  sqlite.prepare(`SELECT status FROM enterprise_flag_requests ORDER BY created_at`).all().map((r: any) => r.status);

describe('isEnterpriseWorkflow', () => {
  it('reads boolean and SQLite integer forms', () => {
    expect(isEnterpriseWorkflow({ isEnterprise: true })).toBe(true);
    expect(isEnterpriseWorkflow({ isEnterprise: 1 })).toBe(true);
    expect(isEnterpriseWorkflow({ isEnterprise: 0 })).toBe(false);
    expect(isEnterpriseWorkflow(null)).toBe(false);
  });
});

describe('owner flag request', () => {
  it('allows one pending request per workflow and leaves the workflow public', async () => {
    const req = await ownerRequestFlag(env, ALICE, WF, 'for ACME');
    expect(req).toMatchObject({ status: 'pending', note: 'for ACME', workflowOwnerId: ALICE_ID });
    await expect(ownerRequestFlag(env, ALICE, WF)).rejects.toMatchObject({ code: 'ENTERPRISE_FLAG_REQUEST_PENDING', status: 409 });
    expect(workflow()).toMatchObject({ isShared: true, isEnterprise: false });
  });

  it('withdraws to cancelled and can ask again', async () => {
    await ownerRequestFlag(env, ALICE, WF);
    await ownerWithdrawFlag(env, ALICE, WF);
    await expect(ownerWithdrawFlag(env, ALICE, WF)).rejects.toMatchObject({ status: 404 });
    await ownerRequestFlag(env, ALICE, WF);
    expect(requestStatuses()).toEqual(['cancelled', 'pending']);
  });

  it('404s for a workflow the caller does not own', async () => {
    await expect(ownerRequestFlag(env, 'bob@example.com', WF)).rejects.toMatchObject({ status: 404 });
  });

  it('rejects a request on an already flagged workflow', async () => {
    workflow().isEnterprise = true;
    await expect(ownerRequestFlag(env, ALICE, WF)).rejects.toMatchObject({ code: 'ENTERPRISE_FLAG_ALREADY_SET' });
  });

  it('deleting the workflow drops its pending request; pending or accepted acceptance blocks it', async () => {
    await ownerRequestFlag(env, ALICE, WF);
    await beforeOwnerDeletesWorkflow(env, ALICE, WF);
    expect(requestStatuses()).toEqual([]);

    workflow().enterpriseAcceptance = 'accepted';
    await expect(beforeOwnerDeletesWorkflow(env, ALICE, WF)).rejects.toMatchObject({ code: 'ENTERPRISE_ACCEPTED', status: 409 });
  });
});

describe('admin queue', () => {
  it('lists pending requests with the owner identifier and DO workflow state', async () => {
    await ownerRequestFlag(env, ALICE, WF);
    const [row] = await adminListFlagRequests(env);
    expect(row).toMatchObject({ ownerIdentifier: ALICE, workflow: { name: 'Invoice bot', status: 'published', isShared: true } });
  });

  it('approve sets the flag on the owner DO only, once', async () => {
    const req = await ownerRequestFlag(env, ALICE, WF);
    await adminApproveFlagRequest(env, 'admin@x', req!.id);
    expect(workflow()).toMatchObject({ isEnterprise: true, enterpriseAcceptance: 'none', enterpriseId: null });
    expect(requestStatuses()).toEqual(['approved']);
    await expect(adminApproveFlagRequest(env, 'admin@x', req!.id)).rejects.toMatchObject({ status: 409 });
  });

  it('approve reverts the claim when the owner DO write fails', async () => {
    const req = await ownerRequestFlag(env, ALICE, WF);
    doRows.clear();
    await expect(adminApproveFlagRequest(env, 'admin@x', req!.id)).rejects.toMatchObject({ status: 404 });
    expect(requestStatuses()).toEqual(['pending']);
  });

  it('reject keeps the flag off and shows the reason to the owner', async () => {
    const req = await ownerRequestFlag(env, ALICE, WF);
    await adminRejectFlagRequest(env, 'admin@x', req!.id, 'Not a business workflow');
    expect(workflow().isEnterprise).toBe(false);
    expect(await ownerLatestFlagRequest(env, ALICE, WF)).toMatchObject({ status: 'rejected', reason: 'Not a business workflow' });
  });
});

describe('admin PUT enterprise flag', () => {
  it('true without a pending request → 409 ENTERPRISE_FLAG_REQUEST_REQUIRED', async () => {
    await expect(adminSetWorkflowFlag(env, 'admin@x', ALICE_ID, WF, { isEnterprise: true })).rejects.toMatchObject({
      code: 'ENTERPRISE_FLAG_REQUEST_REQUIRED',
      status: 409,
    });
  });

  it('true with a pending request approves it', async () => {
    await ownerRequestFlag(env, ALICE, WF);
    await adminSetWorkflowFlag(env, 'admin@x', ALICE_ID, WF, { isEnterprise: true });
    expect(workflow().isEnterprise).toBe(true);
    expect(requestStatuses()).toEqual(['approved']);
  });

  it('false while accepted needs force; force unshares, clears grants and audits', async () => {
    Object.assign(workflow(), { isEnterprise: true, enterpriseId: 'org-1', enterpriseAcceptance: 'accepted', acceptedRoyaltyPercent: 20 });
    sqlite
      .prepare(
        `INSERT INTO enterprise_trigger_grants VALUES ('org-1', ?, ?, 'pro@x', 'chat', NULL, 'biz@x', '2026-01-01')`,
      )
      .run(ALICE_ID, WF);

    await expect(adminSetWorkflowFlag(env, 'admin@x', ALICE_ID, WF, { isEnterprise: false })).rejects.toMatchObject({
      code: 'ENTERPRISE_ACCEPTED',
    });

    await adminSetWorkflowFlag(env, 'admin@x', ALICE_ID, WF, { isEnterprise: false, force: true });
    expect(workflow()).toMatchObject({
      isEnterprise: false,
      enterpriseId: null,
      enterpriseAcceptance: 'none',
      acceptedRoyaltyPercent: null,
      isShared: false,
    });
    expect(sqlite.prepare(`SELECT COUNT(*) AS n FROM enterprise_trigger_grants`).get()).toMatchObject({ n: 0 });
    expect(sqlite.prepare(`SELECT type FROM enterprise_events`).get()).toMatchObject({ type: 'workflow_flag_forced_off' });
  });

  it('false before acceptance keeps sharing as it was', async () => {
    Object.assign(workflow(), { isEnterprise: true, enterpriseId: 'org-1', enterpriseAcceptance: 'pending' });
    await adminSetWorkflowFlag(env, 'admin@x', ALICE_ID, WF, { isEnterprise: false });
    expect(workflow()).toMatchObject({ isEnterprise: false, isShared: true, enterpriseId: null });
  });
});

describe('error mapping outside the enterprise router', () => {
  it('handleError keeps the EnterpriseError status and code', async () => {
    const { EnterpriseError } = await import('./domain');
    const { resolveHttpStatus, resolveClientErrorMessage } = await import('../../shared/http-errors');
    const e = new EnterpriseError('ENTERPRISE_ACCEPTED', 409);
    expect(resolveHttpStatus(e.message, false, e)).toBe(409);
    expect(resolveClientErrorMessage('Failed', e.message, { ENVIRONMENT: 'production' } as any)).toBe('ENTERPRISE_ACCEPTED');
    expect(resolveHttpStatus('Shared workflow not found', false, new Error('Shared workflow not found'))).toBe(404);
  });
});

describe('public doors read the owner DO', () => {
  it('404s an enterprise workflow even while D1 still lists it', async () => {
    await expect(assertPublicSharedOnOwnerDo(env, ALICE_ID, WF)).resolves.toBeTruthy();
    workflow().isEnterprise = true;
    await expect(assertPublicSharedOnOwnerDo(env, ALICE_ID, WF)).rejects.toThrow('Shared workflow not found');
  });

  it('404s when the owner unshared it, and for a malformed owner id', async () => {
    workflow().isShared = false;
    await expect(assertPublicSharedOnOwnerDo(env, ALICE_ID, WF)).rejects.toThrow('Shared workflow not found');
    await expect(assertPublicSharedOnOwnerDo(env, 'nope', WF)).rejects.toThrow('Workflow not found');
  });
});
