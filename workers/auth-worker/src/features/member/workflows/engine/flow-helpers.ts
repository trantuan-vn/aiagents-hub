import { interpolate } from '../execution/node-runtime.js';

type NodeOutput = Record<string, unknown>;

export type FlowBranchHandle = 'true' | 'false' | 'default' | `case_${number}`;

const CASE_HANDLE_RE = /^case_(\d+)$/;

export function isBranchSourceHandle(handle: string | undefined | null): boolean {
  if (!handle || handle === 'in') return false;
  if (handle === 'true' || handle === 'false' || handle === 'default' || handle === 'out') return true;
  return CASE_HANDLE_RE.test(handle);
}

/** Truthy evaluation for IF conditions (supports {{ path }} templates). */
export function evaluateFlowCondition(
  condition: string,
  scope: Record<string, unknown>,
): boolean {
  const trimmed = condition.trim();
  if (!trimmed) return false;

  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  try {
    const value = interpolate(trimmed, scope);
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (value == null) return false;
    if (typeof value === 'string') return value.length > 0 && value !== '0' && value.toLowerCase() !== 'false';
    if (Array.isArray(value)) return value.length > 0;
    return true;
  } catch {
    return false;
  }
}

function parseSwitchCases(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((v) => String(v));
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v));
    } catch {
      return raw.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

function resolveSwitchHandle(
  switchValue: unknown,
  cases: string[],
): FlowBranchHandle | 'default' {
  const needle = String(switchValue ?? '');
  const idx = cases.findIndex((c) => c === needle);
  if (idx >= 0) return `case_${idx}` as FlowBranchHandle;
  return 'default';
}

/**
 * After a flow node executes, which source handles should propagate downstream.
 * Non-flow nodes always activate `out` (and legacy undefined → out).
 */
export function resolveActiveBranchHandles(
  flowKind: string,
  data: Record<string, unknown>,
  nodeInput: NodeOutput,
  scope: Record<string, unknown>,
): Set<string> {
  const active = new Set<string>();

  if (flowKind === 'if') {
    const ok = evaluateFlowCondition(String(data.condition ?? ''), scope);
    active.add(ok ? 'true' : 'false');
    return active;
  }

  if (flowKind === 'switch') {
    const cases = parseSwitchCases(data.switchCases ?? data.cases);
    let switchValue: unknown;
    try {
      switchValue = interpolate(String(data.condition ?? ''), scope);
    } catch {
      switchValue = nodeInput.text ?? nodeInput.data;
    }
    active.add(resolveSwitchHandle(switchValue, cases));
    return active;
  }

  if (flowKind === 'filter') {
    const pass = evaluateFlowCondition(String(data.condition ?? ''), scope);
    if (pass) active.add('out');
    return active;
  }

  // merge, wait, passthrough, unknown
  active.add('out');
  return active;
}

export function activeHandlesForNode(
  node: { type: string; data?: Record<string, unknown> },
  nodeInput: NodeOutput,
  scope: Record<string, unknown>,
): Set<string> {
  if (node.type !== 'flow') {
    return new Set(['out']);
  }
  const data = (node.data ?? {}) as Record<string, unknown>;
  const flowKind = String(data.flowKind ?? 'if');
  return resolveActiveBranchHandles(flowKind, data, nodeInput, scope);
}

/** Whether an outgoing edge should fire given active source handles. */
export function isEdgeActiveForBranches(
  sourceHandle: string | undefined,
  activeHandles: Set<string>,
  sourceNodeType: string,
): boolean {
  const handle = sourceHandle ?? 'out';

  if (sourceNodeType === 'flow') {
    const hasBranchEdges = [...activeHandles].some((h) => h !== 'out');
    if (handle === 'out') {
      // Legacy single-output IF: follow `out` only when condition is true.
      if (activeHandles.has('true') || activeHandles.has('false')) {
        return activeHandles.has('true');
      }
      return activeHandles.has('out') || activeHandles.size === 0;
    }
    return activeHandles.has(handle);
  }

  return handle === 'out' && activeHandles.has('out');
}
