import { interpolate } from '../../../execution/node-runtime.js';
import type { NodeOutput } from '../../types.js';

export type PipelineItem = Record<string, unknown>;

/** Current loop batch or a single upstream object. */
export function pipelineItems(nodeInput: NodeOutput): PipelineItem[] {
  if (Array.isArray(nodeInput.items)) {
    return nodeInput.items
      .map((item) => (item && typeof item === 'object' && !Array.isArray(item) ? (item as PipelineItem) : { value: item }))
      .filter(Boolean);
  }
  const { parents, ...rest } = nodeInput;
  if (Object.keys(rest).length) return [rest];
  return [];
}

function firstString(item: PipelineItem, keys: string[]): string {
  for (const key of keys) {
    const value = item[key];
    if (value == null) continue;
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number') return String(value);
  }
  return '';
}

export function resolvePipelineField(
  template: unknown,
  item: PipelineItem,
  nodeInput: NodeOutput,
  fallbackKeys: string[],
): string {
  const expr = String(template ?? '').trim();
  if (expr.includes('{{')) {
    const resolved = interpolate(expr, { ...nodeInput, ...item, $json: { ...nodeInput, ...item } });
    if (resolved != null && String(resolved).trim()) return String(resolved);
  } else if (expr && !expr.startsWith('{{')) {
    const fromItem = item[expr];
    if (fromItem != null && String(fromItem).trim()) return String(fromItem);
  }
  return firstString(item, fallbackKeys);
}

export function stringifyUnknown(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** Resolve an expression or path against upstream JSON (may return a non-string, e.g. items[]). */
export function resolvePipelineValue(
  template: unknown,
  nodeInput: NodeOutput,
  item?: PipelineItem,
): unknown {
  const expr = String(template ?? '').trim();
  if (!expr) return undefined;
  const merged = { ...nodeInput, ...(item ?? {}) };
  const scope = { ...merged, $json: merged };
  if (expr.includes('{{')) return interpolate(expr, scope);
  if (item && Object.prototype.hasOwnProperty.call(item, expr)) return item[expr];
  return nodeInput[expr];
}
