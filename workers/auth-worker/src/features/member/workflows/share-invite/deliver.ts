import { isEnterpriseWorkflow } from '../../../enterprise/workflow-flag.js';
import { parseShareGrants, type ShareGrant } from '../domain/share-grants.js';
import { PUBLIC_TRIGGER_KINDS, type PublicTriggerKind } from '../domain/public-trigger-kinds.js';
import { summarizeWorkflowListTriggers } from '../infrastructure/list-trigger-summary.js';
import { sendViaPlatformEmail } from '../nodes/human-review/gmail/platform-email.js';
import { buildShareInviteEmail, type ShareInviteLink, type ShareInviteLocale } from './email.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HOURLY_CAP = 60;
const COOLDOWN_SEC = 10 * 60;

export type ShareInviteCode =
  | 'SHARE_INVITE_UNSAVED'
  | 'SHARE_INVITE_NOT_LIVE'
  | 'SHARE_INVITE_NO_TRIGGERS'
  | 'SHARE_INVITE_EMPTY'
  | 'SHARE_INVITE_RATE'
  | 'SHARE_INVITE_FAILED';

export interface ShareInviteSkip {
  email: string;
  reason: 'cooldown' | 'failed';
}

export type ShareInviteResult =
  | {
      ok: true;
      sent: number;
      firstTime: number;
      existing: number;
      skipped: ShareInviteSkip[];
    }
  | { ok: false; code: ShareInviteCode; emails?: string[] };

interface KvStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

interface AccountDb {
  prepare(sql: string): {
    bind(...values: unknown[]): { all(): Promise<{ results?: Array<{ identifier?: string }> }> };
  };
}

export interface ShareInviteEnv {
  FRONTEND_URL?: string;
  BASE_URL?: string;
  NONCE_KV?: KvStore;
  D1DB?: AccountDb;
  BREVO_API_KEY?: { get(): Promise<string> };
}

export interface InviteTarget {
  email: string;
  triggerKinds: PublicTriggerKind[];
}

export function collectInviteTargets(
  grants: ShareGrant[] | null,
  requested: string[],
): { targets: InviteTarget[]; missing: string[]; wanted: string[] } {
  const wanted = [...new Set(requested.map((email) => email.trim().toLowerCase()).filter((email) => EMAIL_RE.test(email)))];
  const list = grants ?? [];
  const missing: string[] = [];
  const targets: InviteTarget[] = [];
  for (const email of wanted) {
    const listed = list.some((grant) => grant.audience === 'users' && grant.emails.includes(email));
    if (!listed) {
      missing.push(email);
      continue;
    }
    const triggerKinds = PUBLIC_TRIGGER_KINDS.filter((kind) =>
      list.some(
        (grant) => grant.audience === 'users' && grant.emails.includes(email) && grant.triggerKinds.includes(kind),
      ),
    );
    if (triggerKinds.length === 0) continue;
    targets.push({ email, triggerKinds });
  }
  return { targets, missing, wanted };
}

function isLiveCommunityWorkflow(workflow: Record<string, unknown>): boolean {
  if (isEnterpriseWorkflow(workflow)) return false;
  const shared = workflow.isShared === true || workflow.isShared === 1 || workflow.isShared === '1';
  return shared && workflow.status === 'published';
}

function textField(workflow: Record<string, unknown>, key: string, fallback: string, max: number): string {
  const value = typeof workflow[key] === 'string' ? workflow[key].trim() : '';
  return (value || fallback).slice(0, max);
}

function origin(value: string | undefined, fallback: string): string {
  return String(value || fallback).replace(/\/$/, '');
}

function loginUrl(frontend: string, returnUrl: string): string {
  const login = new URL(`${frontend}/auth/v3/login`);
  login.searchParams.set('redirect', returnUrl);
  return login.toString();
}

function linksFor(
  workflow: Record<string, unknown>,
  workflowId: number,
  kinds: PublicTriggerKind[],
  apiBase: string,
): ShareInviteLink[] {
  const summary = summarizeWorkflowListTriggers(workflow.definition, JSON.stringify(kinds));
  const links: ShareInviteLink[] = [];
  if (kinds.includes('chat') && summary.chat) {
    links.push({
      kind: 'chat',
      label: 'Chat',
      url: `${apiBase}/chat/${workflowId}/${encodeURIComponent(summary.chat.path)}`,
    });
  }
  if (kinds.includes('form')) {
    for (const form of summary.forms) {
      links.push({
        kind: 'form',
        label: form.label,
        url: `${apiBase}/form/${workflowId}/${encodeURIComponent(form.path)}`,
      });
    }
  }
  return links;
}

async function accountsWithEmail(db: AccountDb | undefined, emails: string[]): Promise<Set<string> | null> {
  if (!db || emails.length === 0) return null;
  const placeholders = emails.map(() => '?').join(', ');
  try {
    const result = await db
      .prepare(`SELECT lower(identifier) AS identifier FROM users WHERE lower(identifier) IN (${placeholders})`)
      .bind(...emails)
      .all();
    const found = new Set<string>();
    for (const row of result.results ?? []) {
      const identifier = String(row.identifier ?? '').trim().toLowerCase();
      if (identifier) found.add(identifier);
    }
    return found;
  } catch {
    return null;
  }
}

function hourKey(ownerId: string, now: number): string {
  return `share-invite-hour:${ownerId}:${Math.floor(now / 3_600_000)}`;
}

function cooldownKey(ownerId: string, workflowId: number, email: string): string {
  return `share-invite:${ownerId}:${workflowId}:${email}`;
}

async function reserveBudget(kv: KvStore, ownerId: string, count: number, now: number): Promise<boolean> {
  const key = hourKey(ownerId, now);
  const current = Number(await kv.get(key)) || 0;
  if (current + count > HOURLY_CAP) return false;
  await kv.put(key, String(current + count), { expirationTtl: 2 * 60 * 60 });
  return true;
}

export async function deliverShareInvites(input: {
  env: ShareInviteEnv;
  workflow: Record<string, unknown>;
  workflowId: number;
  ownerId: string;
  ownerEmail: string;
  emails: string[];
  locale: ShareInviteLocale;
  now?: number;
  lookupAccounts?: (emails: string[]) => Promise<Set<string> | null>;
  send?: (opts: { to: string; subject: string; text: string; html?: string; replyTo?: string }) => Promise<void>;
}): Promise<ShareInviteResult> {
  if (!isLiveCommunityWorkflow(input.workflow)) return { ok: false, code: 'SHARE_INVITE_NOT_LIVE' };

  const { targets, missing, wanted } = collectInviteTargets(parseShareGrants(input.workflow.shareGrants), input.emails);
  if (wanted.length === 0) return { ok: false, code: 'SHARE_INVITE_EMPTY' };
  if (missing.length > 0) return { ok: false, code: 'SHARE_INVITE_UNSAVED', emails: missing };
  if (targets.length === 0) return { ok: false, code: 'SHARE_INVITE_NO_TRIGGERS' };

  const now = input.now ?? Date.now();
  const kv = input.env.NONCE_KV;
  const skipped: ShareInviteSkip[] = [];
  const pending: InviteTarget[] = [];
  for (const target of targets) {
    if (kv && (await kv.get(cooldownKey(input.ownerId, input.workflowId, target.email)))) {
      skipped.push({ email: target.email, reason: 'cooldown' });
      continue;
    }
    pending.push(target);
  }
  if (pending.length === 0) return { ok: true, sent: 0, firstTime: 0, existing: 0, skipped };
  if (kv && !(await reserveBudget(kv, input.ownerId, pending.length, now))) {
    return { ok: false, code: 'SHARE_INVITE_RATE' };
  }

  const lookup = input.lookupAccounts ?? ((emails) => accountsWithEmail(input.env.D1DB, emails));
  const known = await lookup(pending.map((target) => target.email));
  const frontend = origin(input.env.FRONTEND_URL, 'https://aiagents-hub.vn');
  const apiBase = origin(input.env.BASE_URL, 'https://api.aiagents-hub.vn');
  const viewUrl = `${frontend}/dashboard/build/workflows/${input.workflowId}/view?owner=${encodeURIComponent(input.ownerId)}`;
  const openUrl = loginUrl(frontend, viewUrl);
  const ownerEmail = input.ownerEmail.trim().toLowerCase();
  const replyTo = EMAIL_RE.test(ownerEmail) ? ownerEmail : undefined;
  const send =
    input.send ??
    (async (opts) => {
      await sendViaPlatformEmail(input.env as Env, opts);
    });

  const workflowName = textField(input.workflow, 'name', 'Workflow', 120);
  const workflowDescription = textField(input.workflow, 'description', '', 360);
  let sent = 0;
  let firstTime = 0;
  let existing = 0;

  for (const target of pending) {
    const isFirst = known ? !known.has(target.email) : false;
    const message = buildShareInviteEmail({
      locale: input.locale,
      firstTime: isFirst,
      workflowName,
      workflowDescription,
      ownerEmail: ownerEmail || 'aiagents-hub',
      recipientEmail: target.email,
      triggerKinds: target.triggerKinds,
      loginUrl: openUrl,
      links: linksFor(input.workflow, input.workflowId, target.triggerKinds, apiBase),
    });
    try {
      await send({
        to: target.email,
        subject: message.subject,
        text: message.text,
        html: message.html,
        replyTo,
      });
      sent += 1;
      if (isFirst) firstTime += 1;
      else existing += 1;
      if (kv) await kv.put(cooldownKey(input.ownerId, input.workflowId, target.email), '1', { expirationTtl: COOLDOWN_SEC });
    } catch {
      skipped.push({ email: target.email, reason: 'failed' });
    }
  }

  if (sent === 0 && skipped.some((row) => row.reason === 'failed')) return { ok: false, code: 'SHARE_INVITE_FAILED' };
  return { ok: true, sent, firstTime, existing, skipped };
}
