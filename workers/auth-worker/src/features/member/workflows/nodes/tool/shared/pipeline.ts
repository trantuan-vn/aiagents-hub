import { interpolate } from '../../../execution/node-runtime.js';
import type { NodeOutput } from '../../types.js';

export type PipelineItem = Record<string, unknown>;

/** Common question/message keys on chat + webhook payloads. Used only after the user's expression is empty. */
export const USER_TEXT_KEYS = [
  'chatInput',
  'query',
  'question',
  'message',
  'text',
  'input',
  'prompt',
] as const;

/** Lift `body` / `fields` so `{{ $json.chatInput }}` and `{{ $json.body.question }}` both resolve. */
export function flattenTriggerPayload(input: Record<string, unknown>): Record<string, unknown> {
  const body = input.body;
  const fields = input.fields;
  const fromFields =
    fields && typeof fields === 'object' && !Array.isArray(fields)
      ? { ...(fields as Record<string, unknown>) }
      : {};
  const fromBody =
    body && typeof body === 'object' && !Array.isArray(body)
      ? { ...(body as Record<string, unknown>) }
      : {};
  const flat: Record<string, unknown> = { ...fromFields, ...fromBody, ...input };
  if (typeof body === 'string' && body.trim()) {
    if (!usableText(flat.question)) flat.question = body;
    if (!usableText(flat.text)) flat.text = body;
  }
  return flat;
}

export function expressionScope(
  input: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const merged = { ...input, ...extra };
  const flat = flattenTriggerPayload(merged);
  return {
    ...flat,
    $json: flat,
    json: flat,
    body: input.body ?? flat.body,
    input: extra.input ?? flat.input ?? '',
  };
}

function usableText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function firstString(item: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const text = usableText(item[key]);
    if (text) return text;
  }
  return '';
}

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

/**
 * Resolve a user-mapped config expression (`{{ $json.chatInput }}`) against the
 * current payload. If the expression is empty, fall back to common text keys
 * present on the same payload — never invent a prompt.
 */
export function resolveConfiguredText(
  template: unknown,
  input: Record<string, unknown>,
  fallbackInput = '',
  fallbackKeys: readonly string[] = USER_TEXT_KEYS,
): string {
  const scope = expressionScope(input, { input: fallbackInput });
  const expr = String(template ?? '').trim();
  if (expr.includes('{{')) {
    const text = usableText(interpolate(expr, scope));
    if (text && text !== '[object Object]') return text;
  } else if (expr) {
    const named = usableText(scope[expr]);
    if (named) return named;
  }
  if (fallbackInput.trim()) return fallbackInput.trim();
  return firstString(scope, fallbackKeys);
}

export function resolvePipelineField(
  template: unknown,
  item: PipelineItem,
  nodeInput: NodeOutput,
  fallbackKeys: string[],
): string {
  const merged = { ...(nodeInput as Record<string, unknown>), ...item };
  const keys = fallbackKeys;
  return resolveConfiguredText(template, merged, '', keys);
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
  const scope = expressionScope(merged);
  if (expr.includes('{{')) return interpolate(expr, scope);
  if (item && Object.prototype.hasOwnProperty.call(item, expr)) return item[expr];
  const flat = flattenTriggerPayload(merged);
  if (Object.prototype.hasOwnProperty.call(flat, expr)) return flat[expr];
  return nodeInput[expr];
}
