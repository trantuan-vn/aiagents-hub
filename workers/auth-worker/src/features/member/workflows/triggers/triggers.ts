import { executeUtils } from '../../../../shared/utils.js';
import type { UserDO } from '../../../ws/infrastructure/UserDO.js';
import type { WorkflowDefinition } from '../domain/domain.js';
import type { ResolvedWorkflow } from '../execution/workflow-context.js';
import { parseWorkflowDefinition } from '../execution/workflow-context.js';
import { executeWorkflowGraph } from '../engine/executor.js';
import { listFormSubmissionNodes } from './form-submission.js';
import { listChatTriggerNodes } from './chat-submission.js';

/** Channel types align with OpenClaw multi-channel support (Telegram/Slack/Discord). */
export type TriggerType = 'cron' | 'webhook' | 'form' | 'chat' | 'telegram' | 'slack' | 'discord';

const CHANNEL_TYPES: TriggerType[] = ['webhook', 'telegram', 'slack', 'discord'];

export function isChannelTriggerType(type: string): type is 'telegram' | 'slack' | 'discord' {
  return type === 'telegram' || type === 'slack' || type === 'discord';
}

export interface WorkflowTriggerRow {
  triggerId: string;
  ownerId: string;
  workflowId: number;
  type: TriggerType;
  enabled: number;
  cronExpr: string | null;
  webhookToken: string | null;
  /** Canvas node id for webhook triggers (one D1 row per webhook node). */
  nodeId: string | null;
  /** URL path segment — mirrors node.data.webhookPath. */
  webhookPath: string | null;
  input: string | null;
  autoApproveHumanReview: number;
  lastRunMinute: string | null;
  lastRunAt: number | null;
  lastStatus: string | null;
  /** Unix ms of the next matching minute; null until backfilled or for non-cron rows. */
  nextRunAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface WebhookTriggerNodeRef {
  nodeId: string;
  webhookPath: string;
}

/** Path segment used in `/hooks/workflows/:workflowId/:path`. */
export function resolveNodeWebhookPath(
  node: WorkflowDefinition['nodes'][number],
): string {
  const data = (node.data ?? {}) as { webhookPath?: string };
  const custom = String(data.webhookPath ?? '').trim().replace(/^\/+/, '');
  return custom || node.id;
}

/** Webhook ingress nodes on the canvas (trigger + core variants). */
export function isWebhookIngressNode(node: WorkflowDefinition['nodes'][number]): boolean {
  const data = (node.data ?? {}) as { triggerKind?: string; coreKind?: string };
  if (node.type === 'trigger' && data.triggerKind === 'webhook') return true;
  if (node.type === 'core' && data.coreKind === 'webhook') return true;
  return false;
}

/** All webhook nodes that may expose a production URL (matches editor UI). */
export function listWebhookTriggerNodes(definition: WorkflowDefinition): WebhookTriggerNodeRef[] {
  return definition.nodes
    .filter(isWebhookIngressNode)
    .map((n) => ({ nodeId: n.id, webhookPath: resolveNodeWebhookPath(n) }));
}

export function workflowDefinitionHasWebhookTrigger(definition: WorkflowDefinition): boolean {
  return listWebhookTriggerNodes(definition).length > 0;
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

const MAX_CRON_LOOKAHEAD_MINUTES = 366 * 24 * 60;

/** Next UTC minute after `from` that matches `expr`. Same AND semantics as `cronMatches`. */
export function nextCronOccurrence(expr: string, from: Date): Date | null {
  if (expr.trim().split(/\s+/).length !== 5) return null;
  const cursor = new Date(from);
  cursor.setUTCSeconds(0, 0);
  cursor.setUTCMilliseconds(0);
  cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  for (let i = 0; i < MAX_CRON_LOOKAHEAD_MINUTES; i++) {
    if (cronMatches(expr, cursor)) return new Date(cursor);
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }
  return null;
}

function nextRunAtMs(
  expr: string | null | undefined,
  from: Date = new Date(),
  seed?: { ownerId: string; triggerId: string },
): number | null {
  if (!expr) return null;
  const next = nextCronOccurrence(expr, from)?.getTime();
  if (next == null) return null;
  return seed ? next + cronJitterMs(expr, seed.ownerId, seed.triggerId) : next;
}

/** Stable 0–15s jitter for sub-hour crons, 0–2min otherwise — spreads midnight stampedes. */
export function cronJitterMs(expr: string, ownerId: string, triggerId: string): number {
  const max = isHighFrequencyCron(expr) ? 15_000 : 120_000;
  return fnv1a(`${ownerId}:${triggerId}`) % max;
}

export function cronQueueDelaySeconds(ownerId: string, triggerId: string): number {
  return fnv1a(`${ownerId}:${triggerId}:q`) % 31;
}

function isHighFrequencyCron(expr: string): boolean {
  const minute = expr.trim().split(/\s+/)[0] ?? '*';
  if (minute === '*') return true;
  if (minute.startsWith('*/')) {
    const n = parseInt(minute.slice(2), 10);
    return Number.isFinite(n) && n > 0 && n < 30;
  }
  return minute.includes(',');
}

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Earliest alarm timestamp from nextRunAt plus an optional pull-in hint. */
export function resolveAlarmTime(
  earliestNextRunAt: number | null,
  hintMs?: number,
  now = Date.now(),
): number | null {
  const candidates: number[] = [];
  if (typeof earliestNextRunAt === 'number' && Number.isFinite(earliestNextRunAt)) {
    candidates.push(earliestNextRunAt);
  }
  if (typeof hintMs === 'number' && Number.isFinite(hintMs)) {
    candidates.push(hintMs);
  }
  if (!candidates.length) return null;
  return Math.max(Math.min(...candidates), now);
}

export async function earliestCronNextRunAtForOwner(
  db: D1Database,
  ownerId: string,
): Promise<number | null> {
  try {
    const row = await db
      .prepare(
        `SELECT MIN(nextRunAt) as nextRunAt FROM workflow_triggers
         WHERE type = 'cron' AND enabled = 1 AND ownerId = ? AND nextRunAt IS NOT NULL`,
      )
      .bind(ownerId)
      .first<{ nextRunAt: number | null }>();
    return typeof row?.nextRunAt === 'number' ? row.nextRunAt : null;
  } catch {
    return null;
  }
}

export async function backfillCronNextRunAtForOwner(
  db: D1Database,
  ownerId: string,
  from: Date = new Date(),
): Promise<number> {
  let rows: Array<{ triggerId: string; cronExpr: string | null }> = [];
  try {
    const { results } = await db
      .prepare(
        `SELECT triggerId, cronExpr FROM workflow_triggers
         WHERE type = 'cron' AND enabled = 1 AND ownerId = ? AND nextRunAt IS NULL`,
      )
      .bind(ownerId)
      .all<{ triggerId: string; cronExpr: string | null }>();
    rows = results ?? [];
  } catch {
    return 0;
  }
  await Promise.all(
    rows.map((row) =>
      markNextRunAt(db, row.triggerId, nextRunAtMs(row.cronExpr, from, { ownerId, triggerId: row.triggerId })),
    ),
  );
  return rows.length;
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
        nextRunAt INTEGER,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      )`,
    ),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_wt_token ON workflow_triggers(ownerId, webhookToken)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_wt_cron ON workflow_triggers(type, enabled)`),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_wt_workflow ON workflow_triggers(ownerId, workflowId, type)`,
    ),
  ]);
  for (const sql of [
    `ALTER TABLE workflow_triggers ADD COLUMN nodeId TEXT`,
    `ALTER TABLE workflow_triggers ADD COLUMN webhookPath TEXT`,
    `ALTER TABLE workflow_triggers ADD COLUMN nextRunAt INTEGER`,
    `CREATE INDEX IF NOT EXISTS idx_wt_webhook_path ON workflow_triggers(ownerId, workflowId, webhookPath)`,
    `CREATE INDEX IF NOT EXISTS idx_wt_webhook_node ON workflow_triggers(ownerId, workflowId, nodeId)`,
    `CREATE INDEX IF NOT EXISTS idx_wt_cron_due ON workflow_triggers(nextRunAt) WHERE type = 'cron' AND enabled = 1`,
    `CREATE INDEX IF NOT EXISTS idx_wt_cron_owner_due ON workflow_triggers(ownerId, nextRunAt) WHERE type = 'cron' AND enabled = 1`,
  ]) {
    try {
      await db.prepare(sql).run();
    } catch {
      /* column or index may already exist */
    }
  }
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
  nodeId?: string;
  webhookPath?: string;
}

export async function createTrigger(
  db: D1Database,
  input: CreateTriggerInput,
): Promise<WorkflowTriggerRow> {
  await ensureTriggerTable(db);
  const now = Date.now();
  const triggerId = crypto.randomUUID();
  const webhookToken = CHANNEL_TYPES.includes(input.type)
    ? crypto.randomUUID().replace(/-/g, '')
    : null;
  const enabled = input.enabled === false ? 0 : 1;
  const nextRunAt =
    input.type === 'cron' && enabled === 1
      ? nextRunAtMs(input.cronExpr, new Date(), { ownerId: input.ownerId, triggerId })
      : null;
  await db
    .prepare(
      `INSERT INTO workflow_triggers
        (triggerId, ownerId, workflowId, type, enabled, cronExpr, webhookToken, nodeId, webhookPath, input, autoApproveHumanReview, nextRunAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      triggerId,
      input.ownerId,
      input.workflowId,
      input.type,
      enabled,
      input.cronExpr ?? null,
      webhookToken,
      input.nodeId ?? null,
      input.webhookPath ?? null,
      input.input ?? null,
      input.autoApproveHumanReview === false ? 0 : 1,
      nextRunAt,
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

export interface WorkflowActiveCronSummary {
  cronCount: number;
  cronExpr: string;
  nextRunAt: number | null;
}

/** One summary per workflow that has at least one enabled cron row. */
export function summarizeEnabledCrons(
  rows: Array<Pick<WorkflowTriggerRow, 'workflowId' | 'type' | 'enabled' | 'cronExpr' | 'nextRunAt'>>,
): Map<number, WorkflowActiveCronSummary> {
  const byWorkflow = new Map<number, Array<{ cronExpr: string; nextRunAt: number | null }>>();
  for (const row of rows) {
    if (row.type !== 'cron' || row.enabled !== 1) continue;
    const expr = row.cronExpr?.trim();
    if (!expr) continue;
    const list = byWorkflow.get(row.workflowId) ?? [];
    list.push({ cronExpr: expr, nextRunAt: row.nextRunAt });
    byWorkflow.set(row.workflowId, list);
  }
  const out = new Map<number, WorkflowActiveCronSummary>();
  for (const [workflowId, list] of byWorkflow) {
    const soonest = list.reduce((best, cur) => {
      if (best.nextRunAt == null) return cur;
      if (cur.nextRunAt == null) return best;
      return cur.nextRunAt < best.nextRunAt ? cur : best;
    });
    out.set(workflowId, {
      cronCount: list.length,
      cronExpr: soonest.cronExpr,
      nextRunAt: soonest.nextRunAt,
    });
  }
  return out;
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
  patch: {
    enabled?: boolean;
    cronExpr?: string | null;
    input?: string | null;
    autoApproveHumanReview?: boolean;
    webhookPath?: string | null;
    nodeId?: string | null;
  },
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
  if (patch.webhookPath !== undefined) {
    sets.push('webhookPath = ?');
    binds.push(patch.webhookPath);
  }
  if (patch.nodeId !== undefined) {
    sets.push('nodeId = ?');
    binds.push(patch.nodeId);
  }
  if (patch.cronExpr !== undefined || patch.enabled !== undefined) {
    const existing = await getTrigger(db, ownerId, triggerId);
    const expr = patch.cronExpr !== undefined ? patch.cronExpr : existing?.cronExpr;
    const enabled = patch.enabled !== undefined ? patch.enabled : existing?.enabled === 1;
    sets.push('nextRunAt = ?');
    binds.push(
      enabled && existing?.type === 'cron'
        ? nextRunAtMs(expr, new Date(), { ownerId, triggerId })
        : null,
    );
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
  return findChannelTrigger(db, ownerId, 'webhook', token);
}

/** Enabled webhook triggers for a workflow (owner-scoped). */
export async function listWebhookTriggersForWorkflow(
  db: D1Database,
  workflowId: number,
  ownerId: string,
): Promise<WorkflowTriggerRow[]> {
  await ensureTriggerTable(db);
  const { results } = await db
    .prepare(
      `SELECT * FROM workflow_triggers
       WHERE workflowId = ? AND ownerId = ? AND type = 'webhook' AND enabled = 1
       ORDER BY createdAt ASC`,
    )
    .bind(workflowId, ownerId)
    .all<WorkflowTriggerRow>();
  return results ?? [];
}

export async function findWebhookTriggerByNodeId(
  db: D1Database,
  workflowId: number,
  ownerId: string,
  nodeId: string,
): Promise<WorkflowTriggerRow | null> {
  await ensureTriggerTable(db);
  return db
    .prepare(
      `SELECT * FROM workflow_triggers
       WHERE workflowId = ? AND ownerId = ? AND type = 'webhook' AND nodeId = ? AND enabled = 1
       LIMIT 1`,
    )
    .bind(workflowId, ownerId, nodeId)
    .first<WorkflowTriggerRow>();
}

/** Enabled form submission triggers for a workflow (owner-scoped). */
export async function listFormTriggersForWorkflow(
  db: D1Database,
  workflowId: number,
  ownerId: string,
): Promise<WorkflowTriggerRow[]> {
  await ensureTriggerTable(db);
  const { results } = await db
    .prepare(
      `SELECT * FROM workflow_triggers
       WHERE workflowId = ? AND ownerId = ? AND type = 'form' AND enabled = 1
       ORDER BY createdAt ASC`,
    )
    .bind(workflowId, ownerId)
    .all<WorkflowTriggerRow>();
  return results ?? [];
}

export async function findFormTriggerByNodeId(
  db: D1Database,
  workflowId: number,
  ownerId: string,
  nodeId: string,
): Promise<WorkflowTriggerRow | null> {
  await ensureTriggerTable(db);
  return db
    .prepare(
      `SELECT * FROM workflow_triggers
       WHERE workflowId = ? AND ownerId = ? AND type = 'form' AND nodeId = ?
       LIMIT 1`,
    )
    .bind(workflowId, ownerId, nodeId)
    .first<WorkflowTriggerRow>();
}

export async function findFormTriggerByWorkflowId(
  db: D1Database,
  workflowId: number,
  ownerId: string | undefined,
  formPath: string,
): Promise<WorkflowTriggerRow | null> {
  await ensureTriggerTable(db);
  const normalized = formPath.trim().replace(/^\/+/, '');
  if (ownerId) {
    const forms = await listFormTriggersForWorkflow(db, workflowId, ownerId);
    return forms.find((t) => t.webhookPath === normalized || t.nodeId === normalized) ?? null;
  }
  const { results } = await db
    .prepare(
      `SELECT * FROM workflow_triggers
       WHERE workflowId = ? AND type = 'form' AND enabled = 1`,
    )
    .bind(workflowId)
    .all<WorkflowTriggerRow>();
  const forms = results ?? [];
  return forms.find((t) => t.webhookPath === normalized || t.nodeId === normalized) ?? null;
}

/** Keep D1 form trigger rows in sync with canvas form submission nodes. */
export async function syncFormTriggersForWorkflow(
  env: Env,
  bindingName: string,
  db: D1Database,
  ownerId: string,
  workflowId: number,
): Promise<Array<{ nodeId: string; formPath: string }>> {
  let resolved: ResolvedWorkflow;
  try {
    resolved = await resolveOwnedWorkflow(env, bindingName, ownerId, workflowId);
  } catch {
    return [];
  }

  const nodes = listFormSubmissionNodes(resolved.definition);
  const { results } = await db
    .prepare(
      `SELECT * FROM workflow_triggers
       WHERE workflowId = ? AND ownerId = ? AND type = 'form'`,
    )
    .bind(workflowId, ownerId)
    .all<WorkflowTriggerRow>();
  const existing = results ?? [];
  const nodeIds = new Set(nodes.map((n) => n.nodeId));

  for (const row of existing) {
    if (row.nodeId && !nodeIds.has(row.nodeId)) {
      await deleteTrigger(db, ownerId, row.triggerId);
    }
  }

  const byNodeId = new Map(
    existing.filter((r) => r.nodeId).map((r) => [r.nodeId!, r]),
  );

  for (const node of nodes) {
    const row = byNodeId.get(node.nodeId);
    if (!row) {
      await createTrigger(db, {
        ownerId,
        workflowId,
        type: 'form',
        nodeId: node.nodeId,
        webhookPath: node.formPath,
      });
      continue;
    }
    if (row.webhookPath !== node.formPath) {
      await updateTrigger(db, ownerId, row.triggerId, { webhookPath: node.formPath });
    }
  }

  return nodes;
}

/** Enabled chat triggers for a workflow (owner-scoped). */
export async function listChatTriggersForWorkflow(
  db: D1Database,
  workflowId: number,
  ownerId: string,
): Promise<WorkflowTriggerRow[]> {
  await ensureTriggerTable(db);
  const { results } = await db
    .prepare(
      `SELECT * FROM workflow_triggers
       WHERE workflowId = ? AND ownerId = ? AND type = 'chat' AND enabled = 1
       ORDER BY createdAt ASC`,
    )
    .bind(workflowId, ownerId)
    .all<WorkflowTriggerRow>();
  return results ?? [];
}

export async function findChatTriggerByNodeId(
  db: D1Database,
  workflowId: number,
  ownerId: string,
  nodeId: string,
): Promise<WorkflowTriggerRow | null> {
  await ensureTriggerTable(db);
  return db
    .prepare(
      `SELECT * FROM workflow_triggers
       WHERE workflowId = ? AND ownerId = ? AND type = 'chat' AND nodeId = ?
       LIMIT 1`,
    )
    .bind(workflowId, ownerId, nodeId)
    .first<WorkflowTriggerRow>();
}

export async function findChatTriggerByWorkflowId(
  db: D1Database,
  workflowId: number,
  ownerId: string | undefined,
  chatPath: string,
): Promise<WorkflowTriggerRow | null> {
  await ensureTriggerTable(db);
  const normalized = chatPath.trim().replace(/^\/+/, '');
  if (ownerId) {
    const chats = await listChatTriggersForWorkflow(db, workflowId, ownerId);
    return chats.find((t) => t.webhookPath === normalized || t.nodeId === normalized) ?? null;
  }
  const { results } = await db
    .prepare(
      `SELECT * FROM workflow_triggers
       WHERE workflowId = ? AND type = 'chat' AND enabled = 1`,
    )
    .bind(workflowId)
    .all<WorkflowTriggerRow>();
  const chats = results ?? [];
  return chats.find((t) => t.webhookPath === normalized || t.nodeId === normalized) ?? null;
}

/** Keep D1 chat trigger rows in sync with canvas chat nodes. */
export async function syncChatTriggersForWorkflow(
  env: Env,
  bindingName: string,
  db: D1Database,
  ownerId: string,
  workflowId: number,
): Promise<Array<{ nodeId: string; chatPath: string }>> {
  let resolved: ResolvedWorkflow;
  try {
    resolved = await resolveOwnedWorkflow(env, bindingName, ownerId, workflowId);
  } catch {
    return [];
  }

  const nodes = listChatTriggerNodes(resolved.definition);
  const { results } = await db
    .prepare(
      `SELECT * FROM workflow_triggers
       WHERE workflowId = ? AND ownerId = ? AND type = 'chat'`,
    )
    .bind(workflowId, ownerId)
    .all<WorkflowTriggerRow>();
  const existing = results ?? [];
  const nodeIds = new Set(nodes.map((n) => n.nodeId));

  for (const row of existing) {
    if (row.nodeId && !nodeIds.has(row.nodeId)) {
      await deleteTrigger(db, ownerId, row.triggerId);
    }
  }

  const byNodeId = new Map(
    existing.filter((r) => r.nodeId).map((r) => [r.nodeId!, r]),
  );

  for (const node of nodes) {
    const row = byNodeId.get(node.nodeId);
    if (!row) {
      await createTrigger(db, {
        ownerId,
        workflowId,
        type: 'chat',
        nodeId: node.nodeId,
        webhookPath: node.chatPath,
      });
      continue;
    }
    if (row.webhookPath !== node.chatPath) {
      await updateTrigger(db, ownerId, row.triggerId, { webhookPath: node.chatPath });
    }
  }

  return nodes;
}

/**
 * Resolve webhook trigger for an HTTP request.
 * When `webhookPath` is omitted and multiple webhooks exist, returns null (caller should 400).
 */
export async function findWebhookTriggerByWorkflowId(
  db: D1Database,
  workflowId: number,
  ownerId: string,
  webhookPath?: string,
): Promise<WorkflowTriggerRow | null> {
  await ensureTriggerTable(db);
  const webhooks = await listWebhookTriggersForWorkflow(db, workflowId, ownerId);
  if (!webhooks.length) return null;

  if (webhookPath) {
    const normalized = webhookPath.trim().replace(/^\/+/, '');
    return (
      webhooks.find((t) => t.webhookPath === normalized || t.nodeId === normalized) ?? null
    );
  }

  if (webhooks.length === 1) return webhooks[0]!;

  // Legacy row without nodeId/path — only when graph has a single webhook node
  const legacy = webhooks.filter((t) => !t.nodeId && !t.webhookPath);
  if (legacy.length === 1 && webhooks.length === 1) return legacy[0]!;

  return null;
}

/** Sync D1 webhook triggers with webhook nodes on the workflow graph. */
export async function syncWebhookTriggersForWorkflow(
  env: Env,
  bindingName: string,
  db: D1Database,
  ownerId: string,
  workflowId: number,
): Promise<WebhookTriggerNodeRef[]> {
  let resolved: ResolvedWorkflow;
  try {
    resolved = await resolveOwnedWorkflow(env, bindingName, ownerId, workflowId);
  } catch {
    return [];
  }

  const nodes = listWebhookTriggerNodes(resolved.definition);
  const { results } = await db
    .prepare(
      `SELECT * FROM workflow_triggers
       WHERE workflowId = ? AND ownerId = ? AND type = 'webhook'`,
    )
    .bind(workflowId, ownerId)
    .all<WorkflowTriggerRow>();
  const existing = results ?? [];
  const nodeIds = new Set(nodes.map((n) => n.nodeId));

  for (const row of existing) {
    if (row.nodeId && !nodeIds.has(row.nodeId)) {
      await deleteTrigger(db, ownerId, row.triggerId);
    }
  }

  const byNodeId = new Map(
    existing.filter((r) => r.nodeId).map((r) => [r.nodeId!, r]),
  );

  // Attach legacy orphan trigger to the sole webhook node
  if (nodes.length === 1) {
    const legacy = existing.find((r) => !r.nodeId);
    if (legacy && !byNodeId.has(nodes[0]!.nodeId)) {
      await updateTrigger(db, ownerId, legacy.triggerId, {
        nodeId: nodes[0]!.nodeId,
        webhookPath: nodes[0]!.webhookPath,
      });
      byNodeId.set(nodes[0]!.nodeId, {
        ...legacy,
        nodeId: nodes[0]!.nodeId,
        webhookPath: nodes[0]!.webhookPath,
      });
    }
  }

  for (const node of nodes) {
    const row = byNodeId.get(node.nodeId);
    if (!row) {
      await createTrigger(db, {
        ownerId,
        workflowId,
        type: 'webhook',
        nodeId: node.nodeId,
        webhookPath: node.webhookPath,
      });
      continue;
    }
    if (row.webhookPath !== node.webhookPath) {
      await updateTrigger(db, ownerId, row.triggerId, { webhookPath: node.webhookPath });
    }
  }

  return nodes;
}

/** @deprecated Use syncWebhookTriggersForWorkflow — kept for call-site compat during migration. */
export async function ensureWebhookTriggerForWorkflow(
  env: Env,
  bindingName: string,
  db: D1Database,
  ownerId: string,
  workflowId: number,
  webhookPath?: string,
): Promise<WorkflowTriggerRow | null> {
  await syncWebhookTriggersForWorkflow(env, bindingName, db, ownerId, workflowId);
  return findWebhookTriggerByWorkflowId(db, workflowId, ownerId, webhookPath);
}

/** Resolve an enabled trigger by owner, channel type, and URL token. */
export async function findChannelTrigger(
  db: D1Database,
  ownerId: string,
  channel: TriggerType,
  token: string,
): Promise<WorkflowTriggerRow | null> {
  await ensureTriggerTable(db);
  return db
    .prepare(
      `SELECT * FROM workflow_triggers
       WHERE ownerId = ? AND webhookToken = ? AND type = ? AND enabled = 1 LIMIT 1`,
    )
    .bind(ownerId, token, channel)
    .first<WorkflowTriggerRow>();
}

interface CronCandidateLoad {
  rows: WorkflowTriggerRow[];
}

async function loadCronCandidatesForOwner(
  db: D1Database,
  ownerId: string,
  now: Date,
): Promise<CronCandidateLoad> {
  const ts = now.getTime();
  try {
    const { results } = await db
      .prepare(
        `SELECT * FROM workflow_triggers
         WHERE type = 'cron' AND enabled = 1 AND ownerId = ?
           AND (nextRunAt IS NULL OR nextRunAt <= ?)`,
      )
      .bind(ownerId, ts)
      .all<WorkflowTriggerRow>();
    return { rows: results ?? [] };
  } catch {
    try {
      const { results } = await db
        .prepare(
          `SELECT * FROM workflow_triggers WHERE type = 'cron' AND enabled = 1 AND ownerId = ?`,
        )
        .bind(ownerId)
        .all<WorkflowTriggerRow>();
      return { rows: results ?? [] };
    } catch {
      return { rows: [] };
    }
  }
}

/** This owner's enabled cron rows whose `nextRunAt` is due. */
export async function listDueCronTriggersForOwner(
  db: D1Database,
  ownerId: string,
  now: Date,
): Promise<WorkflowTriggerRow[]> {
  const { rows } = await loadCronCandidatesForOwner(db, ownerId, now);
  return rows.filter((t) => !!t.cronExpr);
}

export async function markTriggerRun(
  db: D1Database,
  triggerId: string,
  key: string,
  status: string,
  nextRunAt?: number | null,
): Promise<void> {
  if (nextRunAt !== undefined) {
    try {
      await db
        .prepare(
          `UPDATE workflow_triggers
           SET lastRunMinute = ?, lastRunAt = ?, lastStatus = ?, nextRunAt = ?
           WHERE triggerId = ?`,
        )
        .bind(key, Date.now(), status, nextRunAt, triggerId)
        .run();
      return;
    } catch {
      /* nextRunAt column may not exist yet */
    }
  }
  await db
    .prepare(`UPDATE workflow_triggers SET lastRunMinute = ?, lastRunAt = ?, lastStatus = ? WHERE triggerId = ?`)
    .bind(key, Date.now(), status, triggerId)
    .run();
}

async function markNextRunAt(
  db: D1Database,
  triggerId: string,
  nextRunAt: number | null,
): Promise<void> {
  try {
    await db
      .prepare(`UPDATE workflow_triggers SET nextRunAt = ? WHERE triggerId = ?`)
      .bind(nextRunAt, triggerId)
      .run();
  } catch {
    /* nextRunAt column may not exist yet */
  }
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export async function resolveOwnedWorkflow(
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

/** Canvas node ids for `triggerKind: schedule`. */
export function listScheduleTriggerNodeIds(definition: WorkflowDefinition): string[] {
  return definition.nodes
    .filter((node) => {
      const data = (node.data ?? {}) as { triggerKind?: string };
      return node.type === 'trigger' && data.triggerKind === 'schedule';
    })
    .map((node) => node.id);
}

/** True when a D1 cron row no longer has a matching Schedule node on the canvas. */
export function isOrphanCronTrigger(
  trigger: Pick<WorkflowTriggerRow, 'type' | 'nodeId'>,
  definition: WorkflowDefinition,
): boolean {
  if (trigger.type !== 'cron') return false;
  const scheduleIds = listScheduleTriggerNodeIds(definition);
  if (trigger.nodeId) return !scheduleIds.includes(trigger.nodeId);
  return scheduleIds.length === 0;
}

/** Drop D1 cron rows whose Schedule node was deleted from the canvas. */
export async function syncCronTriggersForWorkflow(
  env: Env,
  bindingName: string,
  db: D1Database,
  ownerId: string,
  workflowId: number,
): Promise<number> {
  let resolved: ResolvedWorkflow;
  try {
    resolved = await resolveOwnedWorkflow(env, bindingName, ownerId, workflowId);
  } catch {
    return 0;
  }

  await ensureTriggerTable(db);
  const { results } = await db
    .prepare(
      `SELECT * FROM workflow_triggers
       WHERE workflowId = ? AND ownerId = ? AND type = 'cron'`,
    )
    .bind(workflowId, ownerId)
    .all<WorkflowTriggerRow>();

  let removed = 0;
  for (const row of results ?? []) {
    if (!isOrphanCronTrigger(row, resolved.definition)) continue;
    await deleteTrigger(db, ownerId, row.triggerId);
    removed += 1;
  }
  return removed;
}

/** Enqueue due cron jobs for one owner. Does not run the workflow graph. */
export async function dispatchDueCronTriggersForOwner(env: Env, ownerId: string): Promise<number> {
  const db = env.D1DB;
  const queue = env.WORKFLOW_CRON_QUEUE;
  if (!db || !queue) return 0;
  const now = new Date();
  const due = await listDueCronTriggersForOwner(db, ownerId, now);
  if (!due.length) return 0;
  const key = minuteKey(now);
  let sent = 0;
  for (const t of due) {
    if (!t.cronExpr) continue;
    const nextRunAt = nextRunAtMs(t.cronExpr, now, { ownerId, triggerId: t.triggerId });
    try {
      await markNextRunAt(db, t.triggerId, nextRunAt);
      await markTriggerRun(db, t.triggerId, key, 'queued');
      await queue.send(
        {
          type: 'workflow-cron-run' as const,
          ownerId,
          triggerId: t.triggerId,
          workflowId: t.workflowId,
          dueMinute: key,
        },
        { delaySeconds: cronQueueDelaySeconds(ownerId, t.triggerId) },
      );
      sent += 1;
    } catch {
      /* nextRunAt already advanced; the following occurrence will retry */
    }
  }
  return sent;
}

/** Run one queued cron trigger. Queue retries on throw. */
export async function consumeWorkflowCronRun(
  env: Env,
  body: {
    ownerId: string;
    triggerId: string;
    dueMinute?: string;
  },
): Promise<void> {
  const db = env.D1DB;
  if (!db) throw new Error('D1 database binding not configured');
  const trigger = await getTrigger(db, body.ownerId, body.triggerId);
  if (!trigger || trigger.type !== 'cron' || trigger.enabled !== 1) return;
  const key = body.dueMinute || minuteKey(new Date());
  if (
    trigger.lastRunMinute === key &&
    trigger.lastStatus &&
    trigger.lastStatus !== 'queued' &&
    trigger.lastStatus !== 'running'
  ) {
    return;
  }
  const resolved = await resolveOwnedWorkflow(env, 'USER_DO', trigger.ownerId, trigger.workflowId);
  if (isOrphanCronTrigger(trigger, resolved.definition)) {
    await deleteTrigger(db, trigger.ownerId, trigger.triggerId);
    return;
  }
  const result = await runTrigger(env, 'USER_DO', trigger);
  await markTriggerRun(db, trigger.triggerId, key, result.status);
}

/**
 * Scope a trigger run to its canvas node. Cron used to omit this, so the engine
 * queued every disconnected trigger (manual + webhook + form) as one extra execution.
 */
export function entryNodeIdsForTrigger(
  trigger: Pick<WorkflowTriggerRow, 'type' | 'nodeId'>,
  definition: WorkflowDefinition,
): string[] | undefined {
  if (trigger.nodeId) return [trigger.nodeId];
  if (trigger.type !== 'cron') return undefined;
  const scheduleIds = listScheduleTriggerNodeIds(definition);
  return scheduleIds.length ? scheduleIds : undefined;
}

/** Execute a workflow on behalf of its owner from a trigger (cron/webhook). */
export async function runTrigger(
  env: Env,
  bindingName: string,
  trigger: WorkflowTriggerRow,
  inputOverride?: string,
  webhookItem?: import('../nodes/webhook/output.js').BuildWebhookItemParams,
) {
  const resolved = await resolveOwnedWorkflow(env, bindingName, trigger.ownerId, trigger.workflowId);
  const entryNodeIds = entryNodeIdsForTrigger(trigger, resolved.definition);
  // Cron without a canvas node used to omit entryNodeIds, so the engine started
  // every disconnected trigger (manual + webhook + form) as a second execution.
  if (trigger.type === 'cron' && !entryNodeIds?.length) {
    return {
      status: 'failed',
      executionKey: crypto.randomUUID(),
      workflowId: resolved.workflowId,
      workflowOwnerId: resolved.ownerId,
      output: { error: 'Schedule trigger node not found' },
      steps: [],
      totalCostVnd: 0,
    };
  }
  return executeWorkflowGraph({
    c: { env } as any,
    bindingName,
    user: { identifier: trigger.ownerId },
    resolved,
    input: inputOverride ?? trigger.input ?? '',
    autoApproveHumanReview: trigger.autoApproveHumanReview === 1,
    runnerDoIdString: trigger.ownerId,
    requestMeta: { userAgent: `trigger:${trigger.type}` },
    entryNodeIds,
    webhookItem,
  });
}
