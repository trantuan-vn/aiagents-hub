import {
  PUBLIC_TRIGGER_KINDS,
  isPublicTriggerAllowed,
  type PublicTriggerKind,
} from './public-trigger-kinds.js';

/** One row on a workflow's share list. "all" is everyone; "users" is the listed accounts. */
export type ShareAudience = 'all' | 'users';

export interface ShareGrant {
  id: string;
  audience: ShareAudience;
  /** Lowercased login emails. Empty when audience is "all". */
  emails: string[];
  triggerKinds: PublicTriggerKind[];
}

const MAX_GRANTS = 20;
const MAX_EMAILS = 30;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GRANT_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

/** Login email used to match a grant. Null when the runner is anonymous or addressed by a DO id. */
export function normalizeRunnerEmail(identifier: string | null | undefined): string | null {
  const value = String(identifier ?? '').trim().toLowerCase();
  return EMAIL_RE.test(value) ? value : null;
}

function grantId(raw: unknown, used: Set<string>): string {
  const candidate = typeof raw === 'string' && GRANT_ID_RE.test(raw) ? raw : crypto.randomUUID();
  if (!used.has(candidate)) return candidate;
  return crypto.randomUUID();
}

function canonicalize(value: unknown[]): ShareGrant[] {
  const used = new Set<string>();
  const grants: ShareGrant[] = [];
  for (const entry of value) {
    if (grants.length >= MAX_GRANTS) break;
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    if (record.audience !== 'all' && record.audience !== 'users') continue;
    const triggerKinds = PUBLIC_TRIGGER_KINDS.filter((kind) =>
      Array.isArray(record.triggerKinds) ? record.triggerKinds.includes(kind) : false,
    );
    const emails =
      record.audience === 'users' && Array.isArray(record.emails)
        ? [...new Set(record.emails.map((email) => String(email).trim().toLowerCase()).filter((email) => EMAIL_RE.test(email)))].slice(
            0,
            MAX_EMAILS,
          )
        : [];
    const id = grantId(record.id, used);
    used.add(id);
    grants.push({ id, audience: record.audience, emails, triggerKinds });
  }
  return grants;
}

/**
 * Stored as a JSON array. Null, empty, or unparseable means the workflow still uses
 * `publicTriggerKinds` for every community user (workflows shared before this list existed).
 * An empty array is explicit: nobody else is granted a trigger.
 */
export function parseShareGrants(raw: unknown): ShareGrant[] | null {
  if (raw == null || raw === '') return null;
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(value)) return null;
  return canonicalize(value);
}

/** Canonical JSON for storage, or null to keep the legacy public-trigger rule. */
export function normalizeShareGrants(raw: unknown): string | null {
  const grants = parseShareGrants(raw);
  return grants ? JSON.stringify(grants) : null;
}

/** Trigger kinds the "all" rows open. Empty when the list grants nobody publicly. */
export function publicTriggerKindsFromShareGrants(grants: ShareGrant[]): string {
  const kinds = PUBLIC_TRIGGER_KINDS.filter((kind) =>
    grants.some((grant) => grant.audience === 'all' && grant.triggerKinds.includes(kind)),
  );
  return JSON.stringify(kinds);
}

export function applyShareGrantsOnWrite(body: {
  shareGrants?: string | null;
  publicTriggerKinds?: string | null;
}): void {
  if (body.shareGrants === undefined) return;
  const normalized = normalizeShareGrants(body.shareGrants);
  body.shareGrants = normalized;
  const grants = parseShareGrants(normalized);
  if (grants) body.publicTriggerKinds = publicTriggerKindsFromShareGrants(grants);
}

export function runnerMayUseTrigger(params: {
  publicTriggerKinds: unknown;
  shareGrants: unknown;
  runnerIdentifier: string | null | undefined;
  kind: PublicTriggerKind;
}): boolean {
  const grants = parseShareGrants(params.shareGrants);
  if (!grants) return isPublicTriggerAllowed(params.publicTriggerKinds, params.kind);
  const email = normalizeRunnerEmail(params.runnerIdentifier);
  return grants.some((grant) => {
    if (!grant.triggerKinds.includes(params.kind)) return false;
    if (grant.audience === 'all') return true;
    return email != null && grant.emails.includes(email);
  });
}

/** Community catalog and shared detail. Legacy rows (no list) stay public. */
export function shareGrantVisibleTo(shareGrants: unknown, runnerIdentifier: string | null | undefined): boolean {
  const grants = parseShareGrants(shareGrants);
  if (!grants) return true;
  const email = normalizeRunnerEmail(runnerIdentifier);
  return grants.some((grant) => {
    if (grant.triggerKinds.length === 0) return false;
    if (grant.audience === 'all') return true;
    return email != null && grant.emails.includes(email);
  });
}

/**
 * Kinds this runner may start, as a JSON array. Null means keep the stored
 * `publicTriggerKinds` (legacy workflows, where null itself means every kind).
 */
export function triggerKindsJsonForRunner(params: {
  publicTriggerKinds: unknown;
  shareGrants: unknown;
  runnerIdentifier: string | null | undefined;
}): string | null {
  const grants = parseShareGrants(params.shareGrants);
  if (!grants) return null;
  const kinds = PUBLIC_TRIGGER_KINDS.filter((kind) =>
    runnerMayUseTrigger({ ...params, kind }),
  );
  return JSON.stringify(kinds);
}
