export const MAX_PERSIST_BYTES = 2_000_000;

const IO_BUDGETS = [96_000, 32_000, 8_000, 2_000] as const;

export type TruncatedStub = { _truncated: true; byteLength: number };

export function isTruncatedStub(value: unknown): value is TruncatedStub {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as { _truncated?: boolean })._truncated === true &&
    !('engine' in (value as object))
  );
}

function jsonSize(value: unknown): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/** Keep a usable prefix of a value so Logs still show real fields, not a stub. */
export function clipValue(value: unknown, budget: number): unknown {
  if (budget <= 8) return null;
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.length <= budget ? value : `${value.slice(0, Math.max(0, budget - 1))}…`;
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
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
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

function clipOutputs(outputs: Record<string, unknown>, budget: number): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [id, value] of Object.entries(outputs)) {
    next[id] = clipValue(value, budget);
  }
  return next;
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

function compactPersisted(
  persisted: Record<string, unknown>,
  options: {
    ioBudget: number;
    keepStepIo: boolean;
    omitDefinition: boolean;
    clipOutputs: boolean;
    clipLoopStates: boolean;
  },
): Record<string, unknown> {
  const engine = (persisted.engine ?? {}) as Record<string, unknown>;
  const outputs =
    engine.outputs && typeof engine.outputs === 'object' && !Array.isArray(engine.outputs)
      ? (engine.outputs as Record<string, unknown>)
      : {};
  const steps = Array.isArray(engine.steps) ? (engine.steps as Array<Record<string, unknown>>) : [];

  return {
    ...persisted,
    ioTruncated: true,
    webhookItem: undefined,
    requestMeta: undefined,
    definitionOmitted: options.omitDefinition ? true : persisted.definitionOmitted,
    definition: options.omitDefinition ? { nodes: [], edges: [] } : persisted.definition,
    input: typeof persisted.input === 'string' ? persisted.input.slice(0, 8_000) : persisted.input,
    engine: {
      ...engine,
      steps: clipSteps(steps, options.ioBudget, options.keepStepIo),
      outputs: options.clipOutputs ? clipOutputs(outputs, options.ioBudget) : outputs,
      finalOutput: options.clipOutputs ? clipValue(engine.finalOutput, options.ioBudget) : engine.finalOutput,
      loopStates: options.clipLoopStates ? clipValue(engine.loopStates ?? {}, options.ioBudget) : engine.loopStates,
      pendingLoopReturn: engine.pendingLoopReturn,
      runContext: {
        input:
          typeof (engine.runContext as { input?: string } | undefined)?.input === 'string'
            ? String((engine.runContext as { input?: string }).input).slice(0, 8_000)
            : '',
        variables: (engine.runContext as { variables?: unknown } | undefined)?.variables ?? persisted.variables ?? {},
        workflowName: (engine.runContext as { workflowName?: unknown } | undefined)?.workflowName,
      },
    },
  };
}

/**
 * Persist a resume-capable snapshot. Oversized I/O is clipped to a usable
 * prefix; the engine skeleton is never replaced by a stub.
 */
export function serializePersistedState(persisted: Record<string, unknown>): string {
  const full = JSON.stringify(persisted);
  if (full.length <= MAX_PERSIST_BYTES) return full;
  console.warn(`[persistResult] state too large (${full.length} bytes), compacting I/O`);

  const stripped: Record<string, unknown> = {
    ...persisted,
    webhookItem: undefined,
    requestMeta: undefined,
  };
  let json = JSON.stringify(stripped);
  if (json.length <= MAX_PERSIST_BYTES) return json;

  for (const ioBudget of IO_BUDGETS) {
    json = JSON.stringify(
      compactPersisted(persisted, {
        ioBudget,
        keepStepIo: true,
        omitDefinition: false,
        clipOutputs: true,
        clipLoopStates: ioBudget <= 8_000,
      }),
    );
    if (json.length <= MAX_PERSIST_BYTES) return json;
  }

  json = JSON.stringify(
    compactPersisted(persisted, {
      ioBudget: 2_000,
      keepStepIo: true,
      omitDefinition: true,
      clipOutputs: true,
      clipLoopStates: true,
    }),
  );
  if (json.length <= MAX_PERSIST_BYTES) return json;

  json = JSON.stringify(
    compactPersisted(persisted, {
      ioBudget: 0,
      keepStepIo: false,
      omitDefinition: true,
      clipOutputs: true,
      clipLoopStates: true,
    }),
  );
  if (json.length <= MAX_PERSIST_BYTES) return json;

  const engine = (persisted.engine ?? {}) as Record<string, unknown>;
  return JSON.stringify({
    ioTruncated: true,
    definitionOmitted: true,
    definition: { nodes: [], edges: [] },
    meta: persisted.meta,
    variables: {},
    autoApproveHumanReview: persisted.autoApproveHumanReview ?? false,
    engine: {
      queue: engine.queue ?? [],
      visited: engine.visited ?? [],
      skipped: engine.skipped ?? [],
      outputs: {},
      steps: clipSteps(
        Array.isArray(engine.steps) ? (engine.steps as Array<Record<string, unknown>>) : [],
        0,
        false,
      ),
      runContext: {},
      totalCostVnd: engine.totalCostVnd ?? 0,
      loopStates: {},
      pendingLoopReturn: engine.pendingLoopReturn,
      entryNodeId: engine.entryNodeId,
    },
  });
}
