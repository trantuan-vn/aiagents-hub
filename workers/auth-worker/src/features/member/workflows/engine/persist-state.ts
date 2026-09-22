/**
 * Execution persist: resume-safe stateCore with declarative PersistShape (Phase 1).
 * Never emit a whole-state `{_truncated}` stub. Measure size in UTF-8 bytes.
 *
 * @see docs/workflow-execution-logging-spec.md
 */

import {
  GLOBAL_NEVER_PERSIST,
  inferKindFromValue,
  mergeNeverPersist,
  resolvePersistShape,
  type PersistShape,
} from './persist-shapes.js';

/** Hot-path DO cap (Phase 1: lowered from 2MB). Alias kept for existing imports/tests. */
export const HOT_STATE_MAX_BYTES = 1_000_000;
export const MAX_PERSIST_BYTES = HOT_STATE_MAX_BYTES;
export const OUTPUT_SUMMARY_MAX_BYTES = 16_384;
/** Per-step input/output preview stored in DO (Logs UI). */
export const STEP_IO_INLINE_MAX_BYTES = 4_096;
export const PERSIST_SCHEMA_VERSION = 1;

/** Per-field I/O budgets applied in order until the snapshot fits. */
const IO_BUDGETS = [64_000, 24_000, 8_000, 2_000] as const;

const textEncoder = new TextEncoder();

export type TruncatedStub = { _truncated: true; byteLength: number };

export type ExecutionPersistMeta = {
  schemaVersion: number;
  ioClipped: boolean;
  persistDegraded: boolean;
  clipPolicy: string;
  hotBytes: number;
};

export class PersistStateTooLargeError extends Error {
  readonly byteLength: number;
  constructor(byteLength: number) {
    super(
      `Execution state still exceeds ${HOT_STATE_MAX_BYTES} bytes after compaction (${byteLength} UTF-8 bytes); cannot persist safely`,
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

/** Drop neverPersist keys from a value tree (deterministic, case-sensitive keys). */
export function stripNeverPersistKeys(
  value: unknown,
  extra?: Iterable<string>,
  depth = 0,
): unknown {
  if (depth > 8 || value == null) return value;
  const deny = new Set<string>(GLOBAL_NEVER_PERSIST);
  if (extra) for (const key of extra) deny.add(key);
  if (Array.isArray(value)) {
    return value.map((item) => stripNeverPersistKeys(item, extra, depth + 1));
  }
  if (typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    if (deny.has(key)) continue;
    out[key] = stripNeverPersistKeys((value as Record<string, unknown>)[key], extra, depth + 1);
  }
  return out;
}

/** Apply PersistShape: keep resumeFields, preview logFields, drop the rest. */
export function applyPersistShape(
  value: unknown,
  shape: PersistShape,
  options?: { logBudget?: number },
): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return stripNeverPersistKeys(value, shape.neverPersist);
  }
  const never = mergeNeverPersist(shape);
  const src = value as Record<string, unknown>;
  const logBudget = options?.logBudget ?? STEP_IO_INLINE_MAX_BYTES;

  if (!shape.resumeFields?.length && !shape.logFields?.length) {
    return stripNeverPersistKeys(src, shape.neverPersist);
  }

  const out: Record<string, unknown> = {};
  const resume = new Set(shape.resumeFields ?? []);
  const log = new Set(shape.logFields ?? []);

  for (const key of Object.keys(src).sort()) {
    if (never.has(key)) continue;
    const nested = stripNeverPersistKeys(src[key], shape.neverPersist);
    if (resume.has(key)) {
      out[key] = nested;
      continue;
    }
    if (log.has(key)) {
      out[key] = clipValue(nested, logBudget);
      continue;
    }
    // Unknown keys: keep a short preview so Logs are not empty for undeclared plugins.
    if (!shape.resumeFields?.length) {
      out[key] = nested;
    }
  }
  return out;
}

type NodeKindIndex = Map<string, { runtimeType: string; kind?: string }>;

function buildNodeKindIndex(definition: unknown): NodeKindIndex {
  const map: NodeKindIndex = new Map();
  const nodes =
    definition &&
    typeof definition === 'object' &&
    Array.isArray((definition as { nodes?: unknown }).nodes)
      ? ((definition as { nodes: Array<Record<string, unknown>> }).nodes)
      : [];
  for (const node of nodes) {
    const id = String(node.id ?? '');
    if (!id) continue;
    const data = (node.data ?? {}) as Record<string, unknown>;
    const kind =
      (typeof data.toolKind === 'string' && data.toolKind) ||
      (typeof data.flowKind === 'string' && data.flowKind) ||
      (typeof data.agentKind === 'string' && data.agentKind) ||
      (typeof data.triggerKind === 'string' && data.triggerKind) ||
      (typeof data.coreKind === 'string' && data.coreKind) ||
      undefined;
    map.set(id, { runtimeType: String(node.type ?? ''), kind: kind || undefined });
  }
  return map;
}

function shapeForNode(
  nodeId: string,
  runtimeType: string,
  output: unknown,
  index: NodeKindIndex,
): PersistShape {
  const fromDef = index.get(nodeId);
  const kind = fromDef?.kind ?? inferKindFromValue(output);
  const type = fromDef?.runtimeType || runtimeType;
  return resolvePersistShape(type, kind);
}

function clipSteps(
  steps: Array<Record<string, unknown>>,
  budget: number,
  io: boolean,
  index: NodeKindIndex,
): Array<Record<string, unknown>> {
  return steps.map((step) => {
    const nodeId = String(step.nodeId ?? '');
    const nodeType = String(step.nodeType ?? '');
    const shape = shapeForNode(nodeId, nodeType, step.output, index);
    const base = {
      nodeId: step.nodeId,
      nodeType: step.nodeType,
      status: step.status,
      error: step.error,
      durationMs: step.durationMs,
      costVnd: step.costVnd,
      attempts: step.attempts,
    };
    if (!io) return base;
    return {
      ...base,
      input: clipValue(stripNeverPersistKeys(step.input, shape.neverPersist), budget),
      output: clipValue(
        applyPersistShape(step.output, shape, { logBudget: budget }),
        budget,
      ),
    };
  });
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
  index: NodeKindIndex,
  options?: { slimItems?: boolean; applyShapes?: boolean },
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  const applyShapes = options?.applyShapes !== false;
  for (const id of Object.keys(outputs).sort()) {
    const value = outputs[id];
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      String((value as { flowKind?: unknown }).flowKind ?? '') === 'loop_over_items'
    ) {
      const loop = value as Record<string, unknown>;
      const { items: _items, tables: _tables, ...rest } = loop;
      const items = Array.isArray(loop.items) ? loop.items : [];
      const shape = resolvePersistShape('flow', 'loop_over_items');
      next[id] = {
        ...(clipValue(
          applyShapes ? applyPersistShape(rest, shape, { logBudget: budget }) : stripNeverPersistKeys(rest),
          budget,
        ) as Record<string, unknown>),
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
    const shape = shapeForNode(id, '', value, index);
    const prepared = applyShapes
      ? applyPersistShape(value, shape, { logBudget: budget })
      : stripNeverPersistKeys(value, shape.neverPersist);
    next[id] = clipValue(prepared, budget);
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
  const jsonProbe = JSON.stringify(snapshot);
  const hotBytes = utf8ByteLength(jsonProbe);
  const persistMeta: ExecutionPersistMeta = {
    schemaVersion: PERSIST_SCHEMA_VERSION,
    ioClipped: !!meta.ioClipped || !!meta.persistDegraded,
    persistDegraded: !!meta.persistDegraded,
    clipPolicy: meta.clipPolicy ?? 'v1/state-core',
    hotBytes,
  };
  return {
    ...snapshot,
    schemaVersion: PERSIST_SCHEMA_VERSION,
    persistMeta,
    ...(persistMeta.ioClipped ? { ioTruncated: true, ioClipped: true } : {}),
    ...(persistMeta.persistDegraded ? { persistDegraded: true } : {}),
    ...(meta.clipPolicy ? { clipPolicy: meta.clipPolicy } : {}),
  };
}

/**
 * Phase 1 baseline: always strip neverPersist, preview steps, shape-slim outputs.
 * Marks ioClipped when any step/output was reduced vs raw.
 */
function normalizeStateCore(persisted: Record<string, unknown>): {
  snapshot: Record<string, unknown>;
  clipped: boolean;
} {
  const index = buildNodeKindIndex(persisted.definition);
  const engine = (persisted.engine ?? {}) as Record<string, unknown>;
  const outputs =
    engine.outputs && typeof engine.outputs === 'object' && !Array.isArray(engine.outputs)
      ? (engine.outputs as Record<string, unknown>)
      : {};
  const steps = Array.isArray(engine.steps) ? (engine.steps as Array<Record<string, unknown>>) : [];

  const slimOutputs: Record<string, unknown> = {};
  let clipped = false;
  for (const id of Object.keys(outputs).sort()) {
    const value = outputs[id];
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      String((value as { flowKind?: unknown }).flowKind ?? '') === 'loop_over_items'
    ) {
      const loop = value as Record<string, unknown>;
      const { tables: _tables, ...rest } = loop;
      const shape = resolvePersistShape('flow', 'loop_over_items');
      const shaped = applyPersistShape(rest, shape, { logBudget: STEP_IO_INLINE_MAX_BYTES });
      if (JSON.stringify(shaped) !== JSON.stringify(stripNeverPersistKeys(rest))) clipped = true;
      if (_tables != null) clipped = true;
      slimOutputs[id] = {
        ...(shaped as Record<string, unknown>),
        items: Array.isArray(loop.items) ? loop.items : [],
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
    const shape = shapeForNode(id, '', value, index);
    const shaped = applyPersistShape(value, shape, { logBudget: STEP_IO_INLINE_MAX_BYTES });
    if (JSON.stringify(shaped) !== JSON.stringify(value)) clipped = true;
    slimOutputs[id] = shaped;
  }

  const slimSteps = clipSteps(steps, STEP_IO_INLINE_MAX_BYTES, true, index);
  for (let i = 0; i < steps.length; i++) {
    if (JSON.stringify(slimSteps[i]) !== JSON.stringify({
      nodeId: steps[i]!.nodeId,
      nodeType: steps[i]!.nodeType,
      status: steps[i]!.status,
      error: steps[i]!.error,
      durationMs: steps[i]!.durationMs,
      costVnd: steps[i]!.costVnd,
      attempts: steps[i]!.attempts,
      input: steps[i]!.input,
      output: steps[i]!.output,
    })) {
      clipped = true;
      break;
    }
  }

  const finalShaped = applyPersistShape(
    engine.finalOutput,
    shapeForNode('__final__', '', engine.finalOutput, index),
    { logBudget: STEP_IO_INLINE_MAX_BYTES },
  );
  if (engine.finalOutput != null && JSON.stringify(finalShaped) !== JSON.stringify(engine.finalOutput)) {
    clipped = true;
  }

  if (persisted.webhookItem != null || persisted.requestMeta != null) clipped = true;

  return {
    clipped,
    snapshot: {
      ...persisted,
      webhookItem: undefined,
      requestMeta: undefined,
      input:
        typeof persisted.input === 'string' ? clipString(persisted.input, 8_000) : persisted.input,
      engine: {
        ...engine,
        steps: slimSteps,
        outputs: slimOutputs,
        finalOutput: finalShaped,
        loopStates: compactLoopStates(engine.loopStates),
        pendingLoopReturn: engine.pendingLoopReturn,
        runContext: resumeRunContext(engine, persisted),
      },
    },
  };
}

function compactPersisted(
  persisted: Record<string, unknown>,
  options: {
    ioBudget: number;
    keepStepIo: boolean;
    omitDefinition: boolean;
    clipOutputs: boolean;
    slimLoopItems?: boolean;
  },
): Record<string, unknown> {
  const index = buildNodeKindIndex(persisted.definition);
  const engine = (persisted.engine ?? {}) as Record<string, unknown>;
  const outputs =
    engine.outputs && typeof engine.outputs === 'object' && !Array.isArray(engine.outputs)
      ? (engine.outputs as Record<string, unknown>)
      : {};
  const steps = Array.isArray(engine.steps) ? (engine.steps as Array<Record<string, unknown>>) : [];

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
      steps: clipSteps(steps, options.ioBudget, options.keepStepIo, index),
      outputs: options.clipOutputs
        ? clipOutputsPreservingLoops(outputs, options.ioBudget, index, {
            slimItems: options.slimLoopItems,
          })
        : clipOutputsPreservingLoops(outputs, Math.max(options.ioBudget, 96_000), index, {
            slimItems: options.slimLoopItems,
            applyShapes: true,
          }),
      finalOutput: options.clipOutputs
        ? clipValue(
            applyPersistShape(engine.finalOutput, shapeForNode('__final__', '', engine.finalOutput, index)),
            options.ioBudget,
          )
        : applyPersistShape(engine.finalOutput, shapeForNode('__final__', '', engine.finalOutput, index)),
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
  const index = buildNodeKindIndex(persisted.definition);
  const engine = (persisted.engine ?? {}) as Record<string, unknown>;
  const loopStates = compactLoopStates(engine.loopStates, {
    slimItems: options?.slimLoopItems,
  });
  const outputs =
    engine.outputs && typeof engine.outputs === 'object' && !Array.isArray(engine.outputs)
      ? (engine.outputs as Record<string, unknown>)
      : {};
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
      outputs: clipOutputsPreservingLoops(outputs, 2_000, index, {
        slimItems: options?.slimLoopItems ?? true,
      }),
      steps: clipSteps(
        Array.isArray(engine.steps) ? (engine.steps as Array<Record<string, unknown>>) : [],
        0,
        false,
        index,
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
  return utf8ByteLength(json) <= HOT_STATE_MAX_BYTES;
}

/**
 * Persist a resume-capable snapshot. Always normalizes to stateCore (Phase 1);
 * oversized I/O continues down the priority ladder. Never replaced by a stub.
 */
export function serializePersistedState(persisted: Record<string, unknown>): string {
  const { snapshot: core, clipped } = normalizeStateCore(persisted);
  let json = JSON.stringify(
    withPersistMeta(core, {
      ioClipped: clipped,
      clipPolicy: clipped ? 'v1/state-core' : 'v1/state-core-passthrough',
    }),
  );
  if (fitsBudget(json)) return json;

  console.warn(
    `[persistResult] stateCore too large (${utf8ByteLength(json)} UTF-8 bytes), compacting I/O`,
  );

  for (const ioBudget of IO_BUDGETS) {
    json = JSON.stringify(
      withPersistMeta(
        compactPersisted(core, {
          ioBudget,
          keepStepIo: true,
          omitDefinition: false,
          clipOutputs: true,
        }),
        { ioClipped: true, clipPolicy: `v1/io-budget-${ioBudget}` },
      ),
    );
    if (fitsBudget(json)) return json;
  }

  json = JSON.stringify(
    withPersistMeta(
      compactPersisted(core, {
        ioBudget: 2_000,
        keepStepIo: true,
        omitDefinition: true,
        clipOutputs: true,
      }),
      { ioClipped: true, clipPolicy: 'v1/omit-definition' },
    ),
  );
  if (fitsBudget(json)) return json;

  json = JSON.stringify(
    withPersistMeta(
      compactPersisted(core, {
        ioBudget: 0,
        keepStepIo: false,
        omitDefinition: true,
        clipOutputs: true,
      }),
      { ioClipped: true, clipPolicy: 'v1/drop-step-io' },
    ),
  );
  if (fitsBudget(json)) return json;

  json = JSON.stringify(
    withPersistMeta(buildLastResortCore(core, { slimLoopItems: false }), {
      ioClipped: true,
      clipPolicy: 'v1/last-resort-core',
    }),
  );
  if (fitsBudget(json)) return json;

  json = JSON.stringify(
    withPersistMeta(buildLastResortCore(core, { slimLoopItems: true }), {
      persistDegraded: true,
      clipPolicy: 'v1/degraded-slim-loop-items',
    }),
  );
  if (fitsBudget(json)) return json;

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
    persistMeta?: Partial<ExecutionPersistMeta>;
    engine?: unknown;
  };
  const legacyStub = isTruncatedStub(state) || (rec._truncated === true && !rec.engine);
  const persistDegraded =
    !legacyStub &&
    (rec.persistDegraded === true || rec.persistMeta?.persistDegraded === true);
  const ioClipped =
    !legacyStub &&
    (rec.ioClipped === true ||
      rec.ioTruncated === true ||
      rec.persistMeta?.ioClipped === true ||
      persistDegraded);
  return {
    legacyStub,
    ioClipped,
    persistDegraded,
    truncated: legacyStub || ioClipped || persistDegraded,
  };
}
