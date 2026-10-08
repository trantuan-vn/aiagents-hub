import {
  PUBLIC_TRIGGER_KINDS,
  parsePublicTriggerKinds,
  type PublicTriggerKind,
} from "./public-trigger-kinds";

export type ShareAudience = "all" | "users";

/** One share-list row. "all" grants everyone; "users" grants the listed login emails. */
export interface ShareGrant {
  id: string;
  audience: ShareAudience;
  emails: string[];
  triggerKinds: PublicTriggerKind[];
}

const MAX_GRANTS = 20;
const MAX_EMAILS = 30;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isShareEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim().toLowerCase());
}

/** Null means the workflow still uses the single public trigger set. */
export function parseShareGrants(raw: unknown): ShareGrant[] | null {
  if (raw == null || raw === "") return null;
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(value)) return null;
  const grants: ShareGrant[] = [];
  for (const entry of value) {
    if (grants.length >= MAX_GRANTS) break;
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    if (record.audience !== "all" && record.audience !== "users") continue;
    const triggerKinds = PUBLIC_TRIGGER_KINDS.filter((kind) =>
      Array.isArray(record.triggerKinds) ? record.triggerKinds.includes(kind) : false,
    );
    const emails =
      record.audience === "users" && Array.isArray(record.emails)
        ? [...new Set(record.emails.map((email) => String(email).trim().toLowerCase()).filter((email) => EMAIL_RE.test(email)))].slice(
            0,
            MAX_EMAILS,
          )
        : [];
    grants.push({
      id: typeof record.id === "string" && record.id ? record.id : crypto.randomUUID(),
      audience: record.audience,
      emails,
      triggerKinds,
    });
  }
  return grants;
}

export function serializeShareGrants(grants: ShareGrant[]): string {
  return JSON.stringify(grants.slice(0, MAX_GRANTS));
}

/** Legacy workflows become one "all" row so the list matches who can run today. */
export function grantsFromStored(shareGrants: unknown, publicTriggerKinds: unknown): ShareGrant[] {
  const parsed = parseShareGrants(shareGrants);
  if (parsed) return parsed;
  const kinds = parsePublicTriggerKinds(publicTriggerKinds);
  return [
    {
      id: crypto.randomUUID(),
      audience: "all",
      emails: [],
      triggerKinds: kinds ?? [...PUBLIC_TRIGGER_KINDS],
    },
  ];
}

export function emptyUserGrant(triggerKinds: PublicTriggerKind[]): ShareGrant {
  return {
    id: crypto.randomUUID(),
    audience: "users",
    emails: [],
    triggerKinds: triggerKinds.length ? triggerKinds : [...PUBLIC_TRIGGER_KINDS],
  };
}
