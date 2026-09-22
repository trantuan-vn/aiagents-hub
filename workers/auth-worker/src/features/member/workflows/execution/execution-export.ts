/**
 * Phase 3 — support export pack for one execution (DO stateCore, no lakehouse / Phase 2 blobs).
 * Builds a ZIP (store method) with redacted secrets.
 */

import { stripNeverPersistKeys } from '../engine/persist-state.js';
import type { ExecutionRow } from './execution-store.js';

const textEncoder = new TextEncoder();

const SECRET_KEY_RE =
  /^(password|passwd|connectstring|authorization|apikey|api_key|access_token|refresh_token|secret|token)$/i;

function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > 10 || value == null) return value;
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item, depth + 1));
  if (typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_RE.test(key) && nested != null && nested !== '') {
      out[key] = '***';
      continue;
    }
    out[key] = redactSecrets(nested, depth + 1);
  }
  return out;
}

function safeParseJson(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw ?? null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function jsonBytes(value: unknown): Uint8Array {
  return textEncoder.encode(`${JSON.stringify(value, null, 2)}\n`);
}

/** CRC-32 (IEEE) for ZIP local headers. */
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]!;
    for (let j = 0; j < 8; j++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(n: number): Uint8Array {
  const b = new Uint8Array(2);
  b[0] = n & 0xff;
  b[1] = (n >>> 8) & 0xff;
  return b;
}

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  b[0] = n & 0xff;
  b[1] = (n >>> 8) & 0xff;
  b[2] = (n >>> 16) & 0xff;
  b[3] = (n >>> 24) & 0xff;
  return b;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

export type ZipEntry = { name: string; data: Uint8Array };

/** Minimal ZIP (STORE / no compression) for Workers — no third-party dep. */
export function buildStoredZip(entries: ZipEntry[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = textEncoder.encode(entry.name);
    const data = entry.data;
    const crc = crc32(data);
    const local = concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
      data,
    ]);
    localParts.push(local);

    const central = concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBytes,
    ]);
    centralParts.push(central);
    offset += local.length;
  }

  const centralDir = concat(centralParts);
  const end = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);

  return concat([...localParts, centralDir, end]);
}

export type ExecutionExportPack = {
  filename: string;
  bytes: Uint8Array;
  contentType: string;
};

/**
 * Build a support ZIP from a DO execution row.
 * Includes redacted stateCore; does not pull R2 lakehouse or Phase 2 blobs.
 */
export function buildExecutionExportPack(row: ExecutionRow): ExecutionExportPack {
  const rawState = safeParseJson(row.state);
  const redactedState = redactSecrets(stripNeverPersistKeys(rawState));
  const engine =
    redactedState && typeof redactedState === 'object' && !Array.isArray(redactedState)
      ? ((redactedState as { engine?: { steps?: unknown } }).engine ?? {})
      : {};
  const steps = Array.isArray((engine as { steps?: unknown }).steps)
    ? (engine as { steps: unknown[] }).steps
    : [];

  const manifest = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    purpose: 'workflow-execution-support',
    note: 'DO stateCore only — not lakehouse analytics; secrets redacted; no Phase 2 I/O blobs',
    executionKey: row.executionKey,
    workflowId: row.workflowId,
    workflowOwnerId: row.workflowOwnerId,
    status: row.status,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    stepCount: row.stepCount,
    persistMeta:
      redactedState && typeof redactedState === 'object'
        ? (redactedState as { persistMeta?: unknown }).persistMeta
        : undefined,
  };

  const record = {
    id: row.id,
    executionKey: row.executionKey,
    workflowId: row.workflowId,
    workflowOwnerId: row.workflowOwnerId,
    workflowName: row.workflowName,
    status: row.status,
    input: row.input,
    output: safeParseJson(row.output),
    error: row.error,
    totalCostVnd: row.totalCostVnd,
    totalCreditsCharged: row.totalCreditsCharged,
    totalCreditsRoyalty: row.totalCreditsRoyalty,
    totalRoyaltyUsd: row.totalRoyaltyUsd,
    stepCount: row.stepCount,
    pendingNodeId: row.pendingNodeId,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  };

  const zip = buildStoredZip([
    { name: 'manifest.json', data: jsonBytes(manifest) },
    { name: 'record.json', data: jsonBytes(record) },
    { name: 'state.json', data: jsonBytes(redactedState) },
    { name: 'steps.json', data: jsonBytes(steps) },
  ]);

  const short = String(row.executionKey || 'exec').slice(0, 8);
  return {
    filename: `execution-${short}-support.zip`,
    bytes: zip,
    contentType: 'application/zip',
  };
}
