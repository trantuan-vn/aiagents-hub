import { executeUtils } from '../../../shared/utils.js';
import type { UserDO } from '../../ws/infrastructure/UserDO.js';
import type { ResolvedWorkflow } from './workflow-context.js';
import { parseWorkflowDefinition } from './workflow-context.js';
import { executeWorkflowGraph } from './executor.js';

export type TriggerType = 'cron' | 'webhook';

export interface WorkflowTriggerRow {
  triggerId: string;
  ownerId: string;
  workflowId: number;
  type: TriggerType;
  enabled: number;
  cronExpr: string | null;
  webhookToken: string | null;
  input: string | null;
  autoApproveHumanReview: number;
  lastRunMinute: string | null;
  lastRunAt: number | null;
  lastStatus: string | null;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Cron matcher (5-field: minute hour day-of-month month day-of-week, UTC)
// ---------------------------------------------------------------------------

function fieldMatch(field: string, value: number, min: number, max: number): boolean {
  if (field === '*') return true;
  for (const part of field.split(',')) {
    const [rangePart, stepPart] = part.split('/');
    const step = stepPart ? parseInt(stepPart, 10) || 1 : 1;
    let lo: number;
    let hi: number;
    if (rangePart === '*' || rangePart === '') {
      lo = min;
      hi = max;
    } else if (rangePart.includes('-')) {
      const [a, b] = rangePart.split('-');
      lo = parseInt(a, 10);
      hi = parseInt(b, 10);
    } else {
      lo = hi = parseInt(rangePart, 10);
    }
    if (Number.isNaN(lo) || Number.isNaN(hi)) continue;
    for (let v = lo; v <= hi; v += step) {
      if (v === value) return true;
    }
  }
  return false;
}

export function cronMatches(expr: string, date: Date): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [m, h, dom, mon, dow] = parts;
  return (
    fieldMatch(m, date.getUTCMinutes(), 0, 59) &&
    fieldMatch(h, date.getUTCHours(), 0, 23) &&
    fieldMatch(dom, date.getUTCDate(), 1, 31) &&
    fieldMatch(mon, date.getUTCMonth() + 1, 1, 12) &&
    fieldMatch(dow, date.getUTCDay(), 0, 6)
  );
}

export function minuteKey(date: Date): string {
  return date.toISOString().slice(0, 16);
}

// ---------------------------------------------------------------------------
// D1 store (managed directly by auth-worker, decoupled from the queue pipeline)
// ---------------------------------------------------------------------------

let tableReady = false;

export async function ensureTriggerTable(db: D1Database): Promise<void> {
  if (tableReady) return;
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS workflow_triggers (
        triggerId TEXT PRIMARY KEY,
        ownerId TEXT NOT NULL,
        workflowId INTEGER NOT NULL,
        type TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        cronExpr TEXT,
        webhookToken TEXT,
        input TEXT,
        autoApproveHumanReview INTEGER NOT NULL DEFAULT 1,
        lastRunMinute TEXT,
        lastRunAt INTEGER,
        lastStatus TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      )`,
    ),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_wt_token ON workflow_triggers(ownerId, webhookToken)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_wt_cron ON workflow_triggers(type, enabled)`),
  ]);
  tableReady = true;
}

export interface CreateTriggerInput {
  ownerId: string;
  workflowId: number;
  type: TriggerType;
  enabled?: boolean;
  cronExpr?: string;
  input?: string;
  autoApproveHumanReview?: boolean;
}

export async function createTrigger(
  db: D1Database,
  input: CreateTriggerInput,
): Promise<WorkflowTriggerRow> {
  await ensureTriggerTable(db);
  const now = Date.now();
  const triggerId = crypto.randomUUID();
  const webhookToken = input.type === 'webhook' ? crypto.randomUUID().replace(/-/g, '') : null;
  await db
    .prepare(
      `INSERT INTO workflow_triggers
        (triggerId, ownerId, workflowId, type, enabled, cronExpr, webhookToken, input, autoApproveHumanReview, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      triggerId,
      input.ownerId,
      input.workflowId,
      input.type,
      input.enabled === false ? 0 : 1,
      input.cronExpr ?? null,
      webhookToken,
      input.input ?? null,
      input.autoApproveHumanReview === false ? 0 : 1,
      now,
      now,
    )
    .run();
  return (await getTrigger(db, input.ownerId, triggerId))!;
}

export async function listTriggers(
  db: D1Database,
  ownerId: string,
  workflowId?: number,
): Promise<WorkflowTriggerRow[]> {
  await ensureTriggerTable(db);
  const sql = workflowId
    ? `SELECT * FROM workflow_triggers WHERE ownerId = ? AND workflowId = ? ORDER BY createdAt DESC`
    : `SELECT * FROM workflow_triggers WHERE ownerId = ? ORDER BY createdAt DESC`;
  const stmt = workflowId
    ? db.prepare(sql).bind(ownerId, workflowId)
    : db.prepare(sql).bind(ownerId);
  const { results } = await stmt.all<WorkflowTriggerRow>();
  return results ?? [];
}

export async function getTrigger(
  db: D1Database,
  ownerId: string,
  triggerId: string,
): Promise<WorkflowTriggerRow | null> {
  await ensureTriggerTable(db);
  return db
    .prepare(`SELECT * FROM workflow_triggers WHERE ownerId = ? AND triggerId = ? LIMIT 1`)
    .bind(ownerId, triggerId)
    .first<WorkflowTriggerRow>();
}

export async function updateTrigger(
  db: D1Database,
  ownerId: string,
  triggerId: string,
  patch: { enabled?: boolean; cronExpr?: string | null; input?: string | null; autoApproveHumanReview?: boolean },
): Promise<WorkflowTriggerRow | null> {
  await ensureTriggerTable(db);
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (patch.enabled !== undefined) {
    sets.push('enabled = ?');
    binds.push(patch.enabled ? 1 : 0);
  }
  if (patch.cronExpr !== undefined) {
    sets.push('cronExpr = ?');
    binds.push(patch.cronExpr);
  }
  if (patch.input !== undefined) {
    sets.push('input = ?');
    binds.push(patch.input);
  }
  if (patch.autoApproveHumanReview !== undefined) {
    sets.push('autoApproveHumanReview = ?');
    binds.push(patch.autoApproveHumanReview ? 1 : 0);
  }
  if (sets.length) {
    sets.push('updatedAt = ?');
    binds.push(Date.now());
    await db
      .prepare(`UPDATE workflow_triggers SET ${sets.join(', ')} WHERE ownerId = ? AND triggerId = ?`)
      .bind(...binds, ownerId, triggerId)
      .run();
  }
  return getTrigger(db, ownerId, triggerId);
}

export async function deleteTrigger(
  db: D1Database,
  ownerId: string,
  triggerId: string,
): Promise<void> {
  await ensureTriggerTable(db);
  await db
    .prepare(`DELETE FROM workflow_triggers WHERE ownerId = ? AND triggerId = ?`)
    .bind(ownerId, triggerId)
    .run();
}

export async function findWebhookTrigger(
  db: D1Database,
  ownerId: string,
  token: string,
): Promise<WorkflowTriggerRow | null> {
  await ensureTriggerTable(db);
  return db
    .prepare(
      `SELECT * FROM workflow_triggers
       WHERE ownerId = ? AND webhookToken = ? AND type = 'webhook' AND enabled = 1 LIMIT 1`,
    )
    .bind(ownerId, token)
    .first<WorkflowTriggerRow>();
}

/** Enabled cron triggers whose expression matches `now` and haven't run this minute. */
export async function listDueCronTriggers(
  db: D1Database,
  now: Date,
): Promise<WorkflowTriggerRow[]> {
  await ensureTriggerTable(db);
  const { results } = await db
    .prepare(`SELECT * FROM workflow_triggers WHERE type = 'cron' AND enabled = 1`)
    .all<WorkflowTriggerRow>();
  const key = minuteKey(now);
  return (results ?? []).filter(
    (t) => t.cronExpr && t.lastRunMinute !== key && cronMatches(t.cronExpr, now),
  );
}

export async function markTriggerRun(
  db: D1Database,
  triggerId: string,
  key: string,
  status: string,
): Promise<void> {
  await db
    .prepare(`UPDATE workflow_triggers SET lastRunMinute = ?, lastRunAt = ?, lastStatus = ? WHERE triggerId = ?`)
    .bind(key, Date.now(), status, triggerId)
    .run();
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function resolveOwnedWorkflow(
  env: Env,
  bindingName: string,
  ownerId: string,
  workflowId: number,
): Promise<ResolvedWorkflow> {
  const binding = (env as unknown as Record<string, unknown>)[bindingName] as DurableObjectNamespace;
  const ownerDO = binding.get(binding.idFromString(ownerId)) as DurableObjectStub<UserDO>;
  const rows = await executeUtils.executeDynamicAction(
    ownerDO,
    'select',
    { where: { field: 'id', operator: '=', value: workflowId } },
    'agent_workflows',
  );
  const wf = Array.isArray(rows) ? rows[0] : rows;
  if (!wf) throw new Error('Workflow not found for trigger');
  return {
    workflow: wf,
    definition: parseWorkflowDefinition(wf.definition),
    ownerId,
    workflowId,
    isOwnedByUser: true,
  };
}

/** Scan D1 for cron triggers due this minute and run them. Called from `scheduled`. */
export async function runDueCronTriggers(env: Env, bindingName: string): Promise<number> {
  const db = (env as unknown as Record<string, unknown>).D1DB as D1Database | undefined;
  if (!db) return 0;
  const now = new Date();
  const key = minuteKey(now);
  const due = await listDueCronTriggers(db, now);
  await Promise.all(
    due.map(async (t) => {
      try {
        const result = await runTrigger(env, bindingName, t);
        await markTriggerRun(db, t.triggerId, key, result.status);
      } catch {
        await markTriggerRun(db, t.triggerId, key, 'failed');
      }
    }),
  );
  return due.length;
}

/** Execute a workflow on behalf of its owner from a trigger (cron/webhook). */
export async function runTrigger(
  env: Env,
  bindingName: string,
  trigger: WorkflowTriggerRow,
  inputOverride?: string,
) {
  const resolved = await resolveOwnedWorkflow(env, bindingName, trigger.ownerId, trigger.workflowId);
  return executeWorkflowGraph({
    c: { env } as any,
    bindingName,
    user: { identifier: trigger.ownerId },
    resolved,
    input: inputOverride ?? trigger.input ?? '',
    autoApproveHumanReview: trigger.autoApproveHumanReview === 1,
    runnerDoIdString: trigger.ownerId,
    requestMeta: { userAgent: `trigger:${trigger.type}` },
  });
}
