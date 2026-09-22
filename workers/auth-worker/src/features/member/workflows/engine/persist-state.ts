/**
 * Phase 0 execution persist: resume-safe snapshots with deterministic I/O clipping.
 * Never emit a whole-state `{_truncated}` stub. Measure size in UTF-8 bytes.
 *
 * @see docs/workflow-execution-logging-spec.md
 */

export const MAX_PERSIST_BYTES = 2_000_000;
export const OUTPUT_SUMMARY_MAX_BYTES = 16_384;
export const PERSIST_SCHEMA_VERSION = 1;

/** Per-field I/O budgets applied in order until the snapshot fits. */
const IO_BUDGETS = [96_000, 32_000, 8_000, 2_000] as const;

const textEncoder = new TextEncoder();

export type TruncatedStub = { _truncated: true; byteLength: number };

export class PersistStateTooLargeError extends Error {
  readonly byteLength: number;
  constructor(byteLength: number) {
    super(
      `Execution state still exceeds ${MAX_PERSIST_BYTES} bytes after compaction (${byteLength} UTF-8 bytes); cannot persist safely`,
    );
    this.name = 'PersistStateTooLargeError';
    this.byteLength = byteLength;
  }
}

export function isTruncatedStub(value: unknown): value is TruncatedStub {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as { _truncated?: boolean })._truncated === true &&
    !('engine' in (value as object))
  );
}

export function utf8ByteLength(text: string): number {
  return textEncoder.encode(text).byteLength;
}

export function utf8JsonSize(value: unknown): number {
  try {
    return utf8ByteLength(JSON.stringify(value));
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function jsonSize(value: unknown): number {
  return utf8JsonSize(value);
}

function clipString(value: string, budget: number): string {
  if (budget <= 1) return '…';
  if (utf8ByteLength(value) <= budget) return value;
  let end = Math.min(value.length, budget);
  while (end > 0 && utf8ByteLength(value.slice(0, end)) > budget - 1) {
    end -= 1;
  }
  return `${value.slice(0, Math.max(0, end))}…`;
}

/**
 * Keep a usable prefix of a value so Logs still show real fields, not a stub.
 * Object keys are sorted so truncation is deterministic across runs.
 */
export function clipValue(value: unknown, budget: number): unknown {
  if (budget <= 8) return null;
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return clipString(value, budget);
  }

  const size = jsonSize(value);
  if (Number.isFinite(size) && size <= budget) return value;

  if (Array.isArray(value)) {
    const kept: unknown[] = [];
    let used = 2;
    for (let i = 0; i < value.length; i++) {
      const remaining = budget - used - (kept.length ? 1 : 0);
      if (remaining < 8) break;
      const clipped = clipValue(value[i], remaining);
      const piece = jsonSize(clipped);
      if (!Number.isFinite(piece) || used + (kept.length ? 1 : 0) + piece > budget) {
        if (kept.length === 0 && clipped != null) kept.push(clipped);
        break;
      }
      kept.push(clipped);
      used += (kept.length > 1 ? 1 : 0) + piece;
    }
    return kept;
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    let used = 2;
    const keys = Object.keys(value as Record<string, unknown>).sort();
    for (const key of keys) {
      const nested = (value as Record<string, unknown>)[key];
      const keySize = jsonSize(key);
      const remaining = budget - used - keySize - 3;
      if (remaining < 8) break;
      const clipped = clipValue(nested, remaining);
      const piece = jsonSize(clipped);
      const add = (used > 2 ? 1 : 0) + keySize + 1 + piece;
      if (!Number.isFinite(piece) || used + add > budget) {
        const tighter = clipValue(nested, Math.min(400, Math.max(32, remaining)));
        const tightSize = jsonSize(tighter);
        const tightAdd = (used > 2 ? 1 : 0) + keySize + 1 + tightSize;
        if (Number.isFinite(tightSize) && used + tightAdd <= budget) {
          out[key] = tighter;
        }
        break;
      }
      out[key] = clipped;
      used += add;
    }
    return out;
  }

  return value;
}

/** Keys that are never needed for resume and often multi-MB (LLM raw, RAG bodies). */
const BULKY_OUTPUT_KEYS = new Set([
  'raw',
  'documents',
  'docs',
  'chunks',
  'embeddings',
  'webhookItem',
  'requestMeta',
]);

/** Drop known bulky / non-resume keys from a value tree (deterministic). */
function stripBulkyKeys(value: unknown, depth = 0): unknown {
  if (depth > 8 || value == null) return value;
  if (Array.isArray(value)) {
    return value.map((item) => stripBulkyKeys(item, depth + 1));
  }
  if (typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    if (BULKY_OUTPUT_KEYS.has(key)) continue;
    out[key] = stripBulkyKeys((value as Record<string, unknown>)[key], depth + 1);
  }
  return out;
}

function clipSteps(
  steps: Array<Record<string, unknown>>,
  budget: number,
  io: boolean,
): Array<Record<string, unknown>> {
  return steps.map((step) => ({
    nodeId: step.nodeId,
    nodeType: step.nodeType,
    status: step.status,
    error: step.error,
    durationMs: step.durationMs,
    costVnd: step.costVnd,
    attempts: step.attempts,
    ...(io
      ? {
          input: clipValue(step.input, budget),
          output: clipValue(step.output, budget),
        }
      : {}),
  }));
}

const RESUME_RUN_CONTEXT_KEYS = ['__saveRagIndexedTables'] as const;

function slimLoopItem(item: unknown): unknown {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
  const o = item as Record<string, unknown>;
  const slim: Record<string, unknown> = {};
  if (o.tableName != null) slim.tableName = o.tableName;
  if (o.schemaName != null) slim.schemaName = o.schemaName;
  if (o.id != null) slim.id = o.id;
  if (o.name != null && Object.keys(slim).length === 0) slim.name = o.name;
  return Object.keys(slim).length ? slim : clipValue(o, 256);
}

function slimLoopItems(items: unknown[]): unknown[] {
  return items.map(slimLoopItem);
}

function clipOutputsPreservingLoops(
  outputs: Record<string, unknown>,
  budget: number,
  options?: { slimItems?: boolean },
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  // Stable node order so sibling clipping is deterministic.
  for (const id of Object.keys(outputs).sort()) {
    const value = outputs[id];
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      String((value as { flowKind?: unknown }).flowKind ?? '') === 'loop_over_items'
    ) {
      // Resume needs the current batch `items` + connection; never stub these away.
      const loop = value as Record<string, unknown>;
      const { items: _items, tables: _tables, ...rest } = loop;
      const items = Array.isArray(loop.items) ? loop.items : [];
      next[id] = {
        ...(clipValue(stripBulkyKeys(rest), budget) as Record<string, unknown>),
        items: options?.slimItems ? slimLoopItems(items) : items,
        tableName: loop.tableName,
        schemaName: loop.schemaName,
        batchIndex: loop.batchIndex,
        batchSize: loop.batchSize,
        totalBatches: loop.totalBatches,
        loopCompleted: loop.loopCompleted,
        flowKind: 'loop_over_items',
        connection: loop.connection,
        user: loop.user,
        password: loop.password,
        connectString: loop.connectString,
        connectionType: loop.connectionType,
        dbId: loop.dbId,
      };
      continue;
    }
    next[id] = clipValue(stripBulkyKeys(value), budget);
  }
  return next;
}

function resumeRunContext(engine: Record<string, unknown>, persisted: Record<string, unknown>): Record<string, unknown> {
  const raw = (engine.runContext ?? {}) as Record<string, unknown>;
  const next: Record<string, unknown> = {
    input: typeof raw.input === 'string' ? clipString(raw.input, 8_000) : '',
    variables: raw.variables ?? persisted.variables ?? {},
    workflowName: raw.workflowName,
  };
  for (const key of RESUME_RUN_CONTEXT_KEYS) {
    if (raw[key] != null) next[key] = raw[key];
  }
  return next;
}

/** Drop bulky per-iteration payloads; keep cursor + item list for resume. */
function compactLoopStates(
  loopStates: unknown,
  options?: { slimItems?: boolean },
): Record<string, unknown> {
  if (!loopStates || typeof loopStates !== 'object' || Array.isArray(loopStates)) return {};
  const out: Record<string, unknown> = {};
  for (const id of Object.keys(loopStates as Record<string, unknown>).sort()) {
    const state = (loopStates as Record<string, unknown>)[id];
    if (!state || typeof state !== 'object' || Array.isArray(state)) continue;
    const s = state as Record<string, unknown>;
    const items = Array.isArray(s.items) ? s.items : [];
    out[id] = {
      items: options?.slimItems ? slimLoopItems(items) : items,
      batchSize: s.batchSize,
      currentBatchIndex: s.currentBatchIndex,
      totalBatches: s.totalBatches,
      // Summaries only — never re-persist multi-MB Save RAG docs here.
      iterationOutputs: Array.isArray(s.iterationOutputs)
        ? s.iterationOutputs.map((row) =>
            row && typeof row === 'object' && !Array.isArray(row)
              ? {
                  ok: (row as Record<string, unknown>).ok,
                  saved: (row as Record<string, unknown>).saved,
                  tableName: (row as Record<string, unknown>).tableName,
                  tables: (row as Record<string, unknown>).tables,
                  skipped: (row as Record<string, unknown>).skipped,
                  error: (row as Record<string, unknown>).error,
                }
              : {},
          )
        : [],
      connectionCtx:
        s.connectionCtx && typeof s.connectionCtx === 'object' && !Array.isArray(s.connectionCtx)
          ? {
              ...(s.connectionCtx as Record<string, unknown>),
              tables: undefined,
              items: undefined,
              count: undefined,
              tableCount: undefined,
            }
          : s.connectionCtx,
    };
  }
  return out;
}

function withPersistMeta(
  snapshot: Record<string, unknown>,
  meta: {
    ioClipped?: boolean;
    persistDegraded?: boolean;
    clipPolicy?: string;
  },
): Record<string, unknown> {
  return {
    ...snapshot,
    schemaVersion: PERSIST_SCHEMA_VERSION,
    ...(meta.ioClipped ? { ioTruncated: true, ioClipped: true } : {}),
    ...(meta.persistDegraded ? { persistDegraded: true, ioTruncated: true, ioClipped: true } : {}),
    ...(meta.clipPolicy ? { clipPolicy: meta.clipPolicy } : {}),
  };
}

function compactPersisted(
  persisted: Record<string, unknown>,
  options: {
    ioBudget: number;
    keepStepIo: boolean;
    omitDefinition: boolean;
    clipOutputs: boolean;
    stripBulky: boolean;
    slimLoopItems?: boolean;
  },
): Record<string, unknown> {
  const engine = (persisted.engine ?? {}) as Record<string, unknown>;
  const outputs =
    engine.outputs && typeof engine.outputs === 'object' && !Array.isArray(engine.outputs)
      ? (engine.outputs as Record<string, unknown>)
      : {};
  const steps = Array.isArray(engine.steps) ? (engine.steps as Array<Record<string, unknown>>) : [];
  const preparedOutputs = options.stripBulky
    ? (stripBulkyKeys(outputs) as Record<string, unknown>)
    : outputs;

  return {
    ...persisted,
    webhookItem: undefined,
    requestMeta: undefined,
    definitionOmitted: options.omitDefinition ? true : persisted.definitionOmitted,
    definition: options.omitDefinition ? { nodes: [], edges: [] } : persisted.definition,
    input:
      typeof persisted.input === 'string' ? clipString(persisted.input, 8_000) : persisted.input,
    engine: {
      ...engine,
      steps: clipSteps(
        options.stripBulky
          ? steps.map((s) => ({
              ...s,
              input: stripBulkyKeys(s.input),
              output: stripBulkyKeys(s.output),
            }))
          : steps,
        options.ioBudget,
        options.keepStepIo,
      ),
      outputs: options.clipOutputs
        ? clipOutputsPreservingLoops(preparedOutputs, options.ioBudget, {
            slimItems: options.slimLoopItems,
          })
        : preparedOutputs,
      finalOutput: options.clipOutputs
        ? clipValue(
            options.stripBulky ? stripBulkyKeys(engine.finalOutput) : engine.finalOutput,
            options.ioBudget,
          )
        : engine.finalOutput,
      // Always keep loop cursor + items — clipping them breaks Resume mid-loop.
      loopStates: compactLoopStates(engine.loopStates, { slimItems: options.slimLoopItems }),
      pendingLoopReturn: engine.pendingLoopReturn,
      runContext: resumeRunContext(engine, persisted),
    },
  };
}

function buildLastResortCore(
  persisted: Record<string, unknown>,
  options?: { slimLoopItems?: boolean },
): Record<string, unknown> {
  const engine = (persisted.engine ?? {}) as Record<string, unknown>;
  const loopStates = compactLoopStates(engine.loopStates, {
    slimItems: options?.slimLoopItems,
  });
  return {
    definitionOmitted: true,
    definition: { nodes: [], edges: [] },
    meta: persisted.meta,
    variables: {},
    autoApproveHumanReview: persisted.autoApproveHumanReview ?? false,
    engine: {
      queue: engine.queue ?? [],
      visited: engine.visited ?? [],
      skipped: engine.skipped ?? [],
      outputs: clipOutputsPreservingLoops(
        engine.outputs && typeof engine.outputs === 'object' && !Array.isArray(engine.outputs)
          ? (stripBulkyKeys(engine.outputs) as Record<string, unknown>)
          : {},
        2_000,
        { slimItems: options?.slimLoopItems ?? true },
      ),
      steps: clipSteps(
        Array.isArray(engine.steps) ? (engine.steps as Array<Record<string, unknown>>) : [],
        0,
        false,
      ),
      runContext: resumeRunContext(engine, persisted),
      totalCostVnd: engine.totalCostVnd ?? 0,
      totalRoyaltyUsd: engine.totalRoyaltyUsd ?? 0,
      loopStates,
      pendingLoopReturn: engine.pendingLoopReturn,
      entryNodeId: engine.entryNodeId,
    },
  };
}

function fitsBudget(json: string): boolean {
  return utf8ByteLength(json) <= MAX_PERSIST_BYTES;
}

/**
 * Persist a resume-capable snapshot. Oversized I/O is clipped via a fixed
 * priority ladder; the engine skeleton is never replaced by a stub.
 * Throws {@link PersistStateTooLargeError} if even the degraded core exceeds the cap.
 */
export function serializePersistedState(persisted: Record<string, unknown>): string {
  const full = JSON.stringify(persisted);
  if (fitsBudget(full)) return full;
  console.warn(
    `[persistResult] state too large (${utf8ByteLength(full)} UTF-8 bytes), compacting I/O`,
  );

  // 1) Strip webhook / request meta
  const stripped: Record<string, unknown> = {
    ...persisted,
    webhookItem: undefined,
    requestMeta: undefined,
  };
  let json = JSON.stringify(
    withPersistMeta(stripped, { ioClipped: true, clipPolicy: 'v1/strip-meta' }),
  );
  if (fitsBudget(json)) return json;

  // 2) Strip bulky keys (raw / dump / docs) without budget clip yet
  json = JSON.stringify(
    withPersistMeta(
      compactPersisted(persisted, {
        ioBudget: 96_000,
        keepStepIo: true,
        omitDefinition: false,
        clipOutputs: false,
        stripBulky: true,
      }),
      { ioClipped: true, clipPolicy: 'v1/strip-bulky' },
    ),
  );
  if (fitsBudget(json)) return json;

  // 3) Priority ladder of IO budgets
  for (const ioBudget of IO_BUDGETS) {
    json = JSON.stringify(
      withPersistMeta(
        compactPersisted(persisted, {
          ioBudget,
          keepStepIo: true,
          omitDefinition: false,
          clipOutputs: true,
          stripBulky: true,
        }),
        { ioClipped: true, clipPolicy: `v1/io-budget-${ioBudget}` },
      ),
    );
    if (fitsBudget(json)) return json;
  }

  // 4) Omit definition
  json = JSON.stringify(
    withPersistMeta(
      compactPersisted(persisted, {
        ioBudget: 2_000,
        keepStepIo: true,
        omitDefinition: true,
        clipOutputs: true,
        stripBulky: true,
      }),
      { ioClipped: true, clipPolicy: 'v1/omit-definition' },
    ),
  );
  if (fitsBudget(json)) return json;

  // 5) Drop step I/O entirely
  json = JSON.stringify(
    withPersistMeta(
      compactPersisted(persisted, {
        ioBudget: 0,
        keepStepIo: false,
        omitDefinition: true,
        clipOutputs: true,
        stripBulky: true,
      }),
      { ioClipped: true, clipPolicy: 'v1/drop-step-io' },
    ),
  );
  if (fitsBudget(json)) return json;

  // 6) Last-resort core (full loop items)
  json = JSON.stringify(
    withPersistMeta(buildLastResortCore(persisted, { slimLoopItems: false }), {
      ioClipped: true,
      clipPolicy: 'v1/last-resort-core',
    }),
  );
  if (fitsBudget(json)) return json;

  // 7) Degraded: slim loop items to resume keys only
  json = JSON.stringify(
    withPersistMeta(buildLastResortCore(persisted, { slimLoopItems: true }), {
      persistDegraded: true,
      clipPolicy: 'v1/degraded-slim-loop-items',
    }),
  );
  if (fitsBudget(json)) return json;

  // 8) Fail closed — never write an oversized or stub snapshot
  throw new PersistStateTooLargeError(utf8ByteLength(json));
}

/**
 * Serialize execution `output` column. Never writes a destructive `{_truncated}` stub.
 */
export function serializeOutputSummary(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const full = JSON.stringify(value);
  if (utf8ByteLength(full) <= OUTPUT_SUMMARY_MAX_BYTES) return full;
  const clipped = clipValue(value, Math.max(64, OUTPUT_SUMMARY_MAX_BYTES - 128));
  return JSON.stringify({
    summary: clipped,
    clipped: true,
    byteLength: utf8ByteLength(full),
  });
}

/** Flags derived from a parsed execution `state` for API / UI. */
export function executionPersistFlags(state: unknown): {
  legacyStub: boolean;
  ioClipped: boolean;
  persistDegraded: boolean;
  /** Backward-compatible OR of the above. */
  truncated: boolean;
} {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return { legacyStub: false, ioClipped: false, persistDegraded: false, truncated: false };
  }
  const rec = state as {
    _truncated?: boolean;
    ioTruncated?: boolean;
    ioClipped?: boolean;
    persistDegraded?: boolean;
    engine?: unknown;
  };
  const legacyStub = isTruncatedStub(state) || (rec._truncated === true && !rec.engine);
  const persistDegraded = !legacyStub && rec.persistDegraded === true;
  const ioClipped =
    !legacyStub && (rec.ioClipped === true || rec.ioTruncated === true || persistDegraded);
  return {
    legacyStub,
    ioClipped,
    persistDegraded,
    truncated: legacyStub || ioClipped || persistDegraded,
  };
}
