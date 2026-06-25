import { executeUtils } from '../../../../shared/utils.js';
import type { UserDO } from '../../../ws/infrastructure/UserDO.js';
import type { WorkflowDefinition } from '../domain/domain.js';
import type { ResolvedWorkflow } from '../execution/workflow-context.js';
import { parseWorkflowDefinition } from '../execution/workflow-context.js';
import { executeWorkflowGraph } from '../executor.js';
import { listFormSubmissionNodes } from './form-submission.js';

/** Channel types align with OpenClaw multi-channel support (Telegram/Slack/Discord). */
export type TriggerType = 'cron' | 'webhook' | 'form' | 'telegram' | 'slack' | 'discord';

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
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_wt_workflow ON workflow_triggers(ownerId, workflowId, type)`,
    ),
  ]);
  for (const sql of [
    `ALTER TABLE workflow_triggers ADD COLUMN nodeId TEXT`,
    `ALTER TABLE workflow_triggers ADD COLUMN webhookPath TEXT`,
    `CREATE INDEX IF NOT EXISTS idx_wt_webhook_path ON workflow_triggers(ownerId, workflowId, webhookPath)`,
    `CREATE INDEX IF NOT EXISTS idx_wt_webhook_node ON workflow_triggers(ownerId, workflowId, nodeId)`,
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
  await db
    .prepare(
      `INSERT INTO workflow_triggers
        (triggerId, ownerId, workflowId, type, enabled, cronExpr, webhookToken, nodeId, webhookPath, input, autoApproveHumanReview, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      triggerId,
      input.ownerId,
      input.workflowId,
      input.type,
      input.enabled === false ? 0 : 1,
      input.cronExpr ?? null,
      webhookToken,
      input.nodeId ?? null,
      input.webhookPath ?? null,
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
  webhookItem?: import('../nodes/webhook/output.js').BuildWebhookItemParams,
) {
  const resolved = await resolveOwnedWorkflow(env, bindingName, trigger.ownerId, trigger.workflowId);
  const entryNodeIds =
    (trigger.type === 'webhook' || trigger.type === 'form') && trigger.nodeId
      ? [trigger.nodeId]
      : undefined;
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
