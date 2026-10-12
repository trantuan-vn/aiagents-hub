import { DynamicWorkerExecutor } from '@cloudflare/codemode';
import { CODE_JS_MODE_EACH, codeJsSourceForMode } from '@aiagents-hub/workflow-nodes';

import type { NodeOutput } from '../types.js';

export type CodeItem = { json: Record<string, unknown> };

const MAX_CODE_CHARS = 24_000;
const MAX_INPUT_CHARS = 500_000;
const TIMEOUT_MS = 15_000;
const RESERVED_OUTPUT_KEYS = new Set(['items', 'data', 'json', 'itemCount', 'text', 'logs', 'parents']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function toCodeItem(item: unknown): CodeItem {
  if (isRecord(item)) {
    if ('json' in item) {
      const json = item.json;
      if (isRecord(json)) return { json: { ...json } };
      return { json: { value: json ?? null } };
    }
    return { json: { ...item } };
  }
  return { json: { value: item ?? null } };
}

/**
 * Live form runs used to spread engine runContext onto the trigger output
 * (`input` / `text` = raw JSON, `variables`, `workflowName`, `data`).
 * Execute step replays the form pin, which is only the answers. Drop the
 * engine copies so both runs expose the same `$input.item.json`.
 */
function dropEngineFormCopies(json: Record<string, unknown>, fields: Record<string, unknown>) {
  if (!Object.prototype.hasOwnProperty.call(fields, 'workflowName') && typeof json.workflowName === 'string') {
    delete json.workflowName;
  }
  if (!Object.prototype.hasOwnProperty.call(fields, 'variables') && isRecord(json.variables)) {
    delete json.variables;
  }
  if (!Object.prototype.hasOwnProperty.call(fields, 'input') && typeof json.input === 'string') {
    delete json.input;
  }
  if (!Object.prototype.hasOwnProperty.call(fields, 'data') && json.data == null) {
    delete json.data;
  }
  if (typeof json.text === 'string' && (fields.text == null || fields.text === '')) {
    try {
      const parsed = JSON.parse(json.text) as unknown;
      if (isRecord(parsed)) delete json.text;
    } catch {
      // A real text answer that is not JSON stays on the item.
    }
  }
}

/** Upstream object shown in the INPUT panel, without the engine parent map. */
export function codeInputPayload(nodeInput: Record<string, unknown> | undefined): Record<string, unknown> {
  const json: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(nodeInput ?? {})) {
    if (key === 'parents') continue;
    json[key] = value;
  }
  // Form submissions keep each answer on `fields` and also copy it to the root.
  // A root key that is missing or null still has the answer at `fields.<key>`.
  const fields = json.fields;
  if (isRecord(fields)) {
    dropEngineFormCopies(json, fields);
    for (const [key, value] of Object.entries(fields)) {
      if (json[key] == null || json[key] === '') json[key] = value;
    }
  }
  return json;
}

/**
 * Rows for `$input.all()` / each-item mode.
 * A non-empty `items` or `data` array is the row list. Dragged paths such as
 * `$input.item.json.user` still read `codeInputPayload`, because the INPUT
 * panel addresses the whole upstream object, not only the first row.
 */
export function inputToCodeItems(nodeInput: Record<string, unknown> | undefined): CodeItem[] {
  const input = nodeInput ?? {};
  if (Array.isArray(input.items) && input.items.length > 0) {
    return input.items.map(toCodeItem);
  }
  if (Array.isArray(input.data)) {
    return input.data.map(toCodeItem);
  }
  const json = codeInputPayload(input);
  if (Object.keys(json).length === 0) return [];
  return [{ json }];
}

export function normalizeCodeReturn(value: unknown): CodeItem[] {
  if (value == null) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.map(toCodeItem);
}

export function codeItemsToOutput(items: CodeItem[], logs?: string[]): NodeOutput {
  const jsons = items.map((item) => item.json);
  const single = jsons.length === 1 ? jsons[0] : undefined;
  const data = single ?? jsons;
  const out: NodeOutput = {
    items,
    data,
    json: single ?? jsons[0] ?? {},
    itemCount: items.length,
    text: JSON.stringify(data),
  };
  if (single) {
    for (const [key, value] of Object.entries(single)) {
      if (!RESERVED_OUTPUT_KEYS.has(key)) out[key] = value;
    }
  }
  if (logs?.length) out.logs = logs;
  return out;
}

/** Wrap user code so a missing wrapper still runs as an async function. */
export function wrapUserCode(code: string): string {
  const trimmed = code.replace(/^```(?:js|javascript)?\s*\n?/i, '').replace(/```\s*$/i, '').trim();
  if (!trimmed) return 'async () => {}';
  if (/^(async\s+)?(\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/.test(trimmed) || /^async\s+function\b/.test(trimmed)) {
    return trimmed;
  }
  return `async () => {\n${trimmed}\n}`;
}

export function buildCodeSandboxSource(args: {
  mode: string;
  code: string;
  items: CodeItem[];
  payload: Record<string, unknown>;
}): string {
  const fn = wrapUserCode(args.code);
  const itemsJson = JSON.stringify(args.items);
  const payloadJson = JSON.stringify(args.payload);
  const inputHelpers = `{
      all() { return __items; },
      first() { return __items[0] || { json: {} }; },
      last() { return __items[__items.length - 1] || { json: {} }; },
      item: __item,
    }`;

  const ship = `const __ship = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));`;

  if (args.mode === CODE_JS_MODE_EACH) {
    return `async () => {
  const __payload = ${payloadJson};
  const __items = ${itemsJson};
  let $input;
  let $json = {};
  let $itemIndex = 0;
  const __fn = ${fn};
  const __out = [];
  ${ship}
  const __view = (row) => {
    const rowJson = row && row.json && typeof row.json === 'object' && !Array.isArray(row.json) ? row.json : {};
    const json = { ...rowJson };
    for (const [key, value] of Object.entries(__payload)) {
      if (Object.prototype.hasOwnProperty.call(json, key)) continue;
      if (key === 'items' || key === 'parents') continue;
      json[key] = value;
    }
    return { json };
  };
  for (let __i = 0; __i < __items.length; __i++) {
    const __item = __view(__items[__i]);
    $itemIndex = __i;
    $json = __item.json;
    $input = ${inputHelpers};
    const __result = await __fn();
    if (Array.isArray(__result)) {
      for (const __row of __result) __out.push(__row);
    } else if (__result !== undefined && __result !== null) {
      __out.push(__result);
    }
  }
  return __ship(__out);
}`;
  }

  return `async () => {
  const __payload = ${payloadJson};
  const __items = ${itemsJson};
  const __item = { json: __payload };
  const $input = ${inputHelpers};
  const $json = __payload;
  const $itemIndex = 0;
  const __fn = ${fn};
  ${ship}
  return __ship(await __fn());
}`;
}

export function resolveCodeSource(data: Record<string, unknown>): { mode: string; code: string } {
  const language = String(data.language ?? 'javascript').toLowerCase();
  if (language === 'python') {
    throw new Error('Code node only supports JavaScript');
  }
  const mode = String(data.mode ?? 'runOnceForAllItems');
  const raw = data.jsCode ?? data.code ?? data.template;
  const code = String(raw ?? codeJsSourceForMode(mode));
  if (!code.trim()) throw new Error('Code node: JavaScript is empty');
  if (code.length > MAX_CODE_CHARS) {
    throw new Error(`Code node: JavaScript exceeds ${MAX_CODE_CHARS} characters`);
  }
  return { mode, code };
}

export async function runCodeTransform(args: {
  env: { LOADER?: WorkerLoader };
  data: Record<string, unknown>;
  nodeInput: Record<string, unknown>;
}): Promise<NodeOutput> {
  const { mode, code } = resolveCodeSource(args.data);
  const payload = codeInputPayload(args.nodeInput);
  const items = inputToCodeItems(args.nodeInput);
  const inputChars = JSON.stringify(payload).length + JSON.stringify(items).length;
  if (inputChars > MAX_INPUT_CHARS) {
    throw new Error('Code node: input is too large to transform');
  }
  const loader = args.env.LOADER;
  if (!loader) {
    throw new Error('Code node requires the LOADER worker binding');
  }

  const source = buildCodeSandboxSource({ mode, code, items, payload });
  const executor = new DynamicWorkerExecutor({
    loader,
    timeout: TIMEOUT_MS,
    globalOutbound: null,
  });
  const executed = await executor.execute(source, []);
  if (executed.error) {
    const logTail = executed.logs?.length ? `\n${executed.logs.slice(-8).join('\n')}` : '';
    throw new Error(`Code node: ${executed.error}${logTail}`);
  }
  const nextItems = normalizeCodeReturn(executed.result);
  return codeItemsToOutput(nextItems, executed.logs);
}
