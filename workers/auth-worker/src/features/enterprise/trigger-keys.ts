/**
 * `node.data.enterpriseTriggerKey` (§3.5): a UUID per invokable trigger node. Grants and credentials
 * point at the key, never at the canvas id or the kind.
 */

export type EnterpriseTriggerKind = 'webhook' | 'chat' | 'form' | 'schedule';

/** Form inputs the in-app run dialog renders. Nothing else from the definition leaves the server. */
export type EnterpriseFormField = {
  fieldName: string;
  label: string;
  fieldType: string;
  required: boolean;
  options?: string[];
};

export type EnterpriseTrigger = {
  triggerKey: string;
  nodeId: string;
  kind: EnterpriseTriggerKind;
  label: string;
  fields?: EnterpriseFormField[];
  /** Webhook only. Path segment of `POST /hooks/workflows/:workflowId/:webhookPath`. */
  webhookPath?: string;
  /**
   * Webhook only. JSON the caller should POST, built from `$json.body.*` (and `$json.chatInput`)
   * on the node wired directly after this trigger. Values are empty placeholders.
   */
  bodyExample?: Record<string, unknown>;
};

type RawNode = { id?: unknown; type?: unknown; data?: Record<string, unknown> | null };
type RawEdge = { source?: unknown; target?: unknown; sourceHandle?: unknown; targetHandle?: unknown };

export function enterpriseTriggerKind(node: RawNode): EnterpriseTriggerKind | null {
  const data = (node.data ?? {}) as Record<string, unknown>;
  if (node.type === 'core' && data.coreKind === 'webhook') return 'webhook';
  if (node.type !== 'trigger') return null;
  switch (data.triggerKind) {
    case 'webhook':
      return 'webhook';
    case 'chat':
      return 'chat';
    case 'schedule':
      return 'schedule';
    case 'form':
      return data.formKind === 'database' ? null : 'form';
    default:
      return null;
  }
}

function parseNodes(raw: unknown): { doc: Record<string, unknown>; nodes: RawNode[]; edges: RawEdge[] } | null {
  try {
    const doc = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!doc || typeof doc !== 'object' || !Array.isArray((doc as { nodes?: unknown }).nodes)) return null;
    const edges = Array.isArray((doc as { edges?: unknown }).edges) ? ((doc as { edges: RawEdge[] }).edges) : [];
    return { doc: doc as Record<string, unknown>, nodes: (doc as { nodes: RawNode[] }).nodes, edges };
  } catch {
    return null;
  }
}

function keyOf(node: RawNode): string | null {
  const key = node.data?.enterpriseTriggerKey;
  return typeof key === 'string' && key.length > 0 ? key : null;
}

/**
 * Give every trigger node a key, keeping the key it had in `previous` under the same node id.
 * The canvas may save a stale copy without keys; a copied node carries its source's key and gets a new one.
 * Returns the definition string unchanged when nothing moved.
 */
export function assignEnterpriseTriggerKeys(previous: unknown, incoming: string): string {
  const next = parseNodes(incoming);
  if (!next) return incoming;
  const keyById = new Map<string, string>();
  for (const node of parseNodes(previous)?.nodes ?? []) {
    const key = keyOf(node);
    if (key && typeof node.id === 'string') keyById.set(node.id, key);
  }

  const claimed = new Map<string, string>();
  for (const node of next.nodes) {
    const key = keyOf(node);
    if (key && typeof node.id === 'string' && keyById.get(node.id) === key) claimed.set(key, node.id);
  }

  let changed = false;
  for (const node of next.nodes) {
    if (!enterpriseTriggerKind(node) || typeof node.id !== 'string') continue;
    let key = keyOf(node) ?? keyById.get(node.id) ?? null;
    const owner = key ? claimed.get(key) : undefined;
    if (!key || (owner && owner !== node.id)) key = crypto.randomUUID();
    claimed.set(key, node.id);
    if (keyOf(node) !== key) {
      node.data = { ...(node.data ?? {}), enterpriseTriggerKey: key };
      changed = true;
    }
  }
  return changed ? JSON.stringify(next.doc) : incoming;
}

export function listEnterpriseTriggers(definition: unknown): EnterpriseTrigger[] {
  const graph = parseNodes(definition);
  const out: EnterpriseTrigger[] = [];
  for (const node of graph?.nodes ?? []) {
    const kind = enterpriseTriggerKind(node);
    const key = keyOf(node);
    if (!kind || !key || typeof node.id !== 'string') continue;
    const data = node.data ?? {};
    const label = String(data.label ?? data.title ?? data.name ?? kind);
    const webhookPath = kind === 'webhook' ? webhookPathOf(node) : undefined;
    const bodyExample = kind === 'webhook' && graph ? webhookBodyExample(node.id, graph.nodes, graph.edges) : undefined;
    out.push({
      triggerKey: key,
      nodeId: node.id,
      kind,
      label,
      ...(kind === 'form' ? { fields: formFields(data.formElements) } : {}),
      ...(webhookPath ? { webhookPath } : {}),
      ...(bodyExample ? { bodyExample } : {}),
    });
  }
  return out;
}

function webhookPathOf(node: RawNode): string | undefined {
  const custom = String(node.data?.webhookPath ?? '').trim().replace(/^\/+/, '');
  if (custom) return custom;
  return typeof node.id === 'string' && node.id ? node.id : undefined;
}

const RESOURCE_HANDLES = new Set(['service', 'memory', 'tools', 'llm']);
const QUESTION_KEYS = ['question', 'message', 'query', 'text', 'chatInput', 'input'];
const TRAILING_METHODS = new Set([
  'toLowerCase', 'toUpperCase', 'trim', 'trimStart', 'trimEnd', 'toString', 'valueOf',
  'split', 'replace', 'replaceAll', 'includes', 'startsWith', 'endsWith', 'slice',
  'substring', 'substr', 'toFixed', 'map', 'filter', 'join', 'at', 'length',
]);
const BODY_PATH_RE = /\$json\??\.body((?:\??\.[A-Za-z_][A-Za-z0-9_]*|\[\d+\]|\[['"][^'"\]]{1,80}['"]\])+)/g;
const SEGMENT_RE = /\??\.([A-Za-z_][A-Za-z0-9_]*)|\[(\d+)\]|\[['"]([^'"\]]{1,80})['"]\]/g;
const MAX_PATHS = 40;

/** Data-flow edge into the next node (`out`/`true`/… → `in`), not a resource wire. */
function isNextNodeEdge(edge: RawEdge): boolean {
  const sourceHandle = typeof edge.sourceHandle === 'string' ? edge.sourceHandle : undefined;
  const targetHandle = typeof edge.targetHandle === 'string' ? edge.targetHandle : undefined;
  const handle = sourceHandle ?? targetHandle;
  if (handle && RESOURCE_HANDLES.has(handle)) return false;
  if ((targetHandle ?? 'in') !== 'in') return false;
  const source = sourceHandle ?? 'out';
  if (source === 'in') return false;
  if (source === 'out' || source === 'true' || source === 'false' || source === 'default' || source === 'loop' || source === 'done') {
    return true;
  }
  return /^case_\d+$/.test(source);
}

function collectStrings(value: unknown, out: string[], depth = 0) {
  if (depth > 12 || out.length > 400) return;
  if (typeof value === 'string') {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out, depth + 1);
    return;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) collectStrings(item, out, depth + 1);
  }
}

function bodyPath(suffix: string): Array<string | number> | null {
  const parts: Array<string | number> = [];
  SEGMENT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  let consumed = 0;
  while ((match = SEGMENT_RE.exec(suffix))) {
    if (match.index !== consumed) return null;
    consumed = match.index + match[0].length;
    if (match[1]) parts.push(match[1]);
    else if (match[2]) parts.push(Number(match[2]));
    else if (match[3]) parts.push(match[3]);
  }
  if (consumed !== suffix.length || parts.length === 0 || typeof parts[0] === 'number') return null;
  const last = parts[parts.length - 1];
  if (typeof last === 'string' && TRAILING_METHODS.has(last)) parts.pop();
  return parts.length ? parts : null;
}

function assignSample(root: Record<string, unknown>, parts: Array<string | number>) {
  let cur: unknown = root;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const last = i === parts.length - 1;
    const next = parts[i + 1];
    if (typeof part === 'number') {
      if (!Array.isArray(cur)) return;
      const arr = cur as unknown[];
      if (last) {
        if (arr[part] === undefined) arr[part] = '';
        return;
      }
      if (arr[part] == null || typeof arr[part] !== 'object') arr[part] = typeof next === 'number' ? [] : {};
      cur = arr[part];
      continue;
    }
    if (!cur || typeof cur !== 'object' || Array.isArray(cur)) return;
    const obj = cur as Record<string, unknown>;
    if (last) {
      if (obj[part] === undefined) obj[part] = '';
      return;
    }
    if (obj[part] == null || typeof obj[part] !== 'object') obj[part] = typeof next === 'number' ? [] : {};
    cur = obj[part];
  }
}

/** Sample POST body for one webhook, from variables the immediate next node reads. */
export function webhookBodyExample(nodeId: string, nodes: RawNode[], edges: RawEdge[]): Record<string, unknown> | undefined {
  const nextIds = edges
    .filter((edge) => edge.source === nodeId && typeof edge.target === 'string' && isNextNodeEdge(edge))
    .map((edge) => edge.target as string);
  if (!nextIds.length) return undefined;

  const byId = new Map(nodes.filter((node) => typeof node.id === 'string').map((node) => [node.id as string, node]));
  const paths: Array<Array<string | number>> = [];
  const seen = new Set<string>();
  let readsChatInput = false;

  for (const id of nextIds) {
    const texts: string[] = [];
    collectStrings(byId.get(id)?.data ?? {}, texts);
    for (const text of texts) {
      if (/\$json\??\.chatInput\b/.test(text)) readsChatInput = true;
      BODY_PATH_RE.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = BODY_PATH_RE.exec(text))) {
        const parts = bodyPath(match[1] ?? '');
        if (!parts) continue;
        const key = JSON.stringify(parts);
        if (seen.has(key)) continue;
        seen.add(key);
        paths.push(parts);
        if (paths.length >= MAX_PATHS) break;
      }
      if (paths.length >= MAX_PATHS) break;
    }
  }

  const example: Record<string, unknown> = {};
  for (const parts of paths) assignSample(example, parts);
  if (readsChatInput && !QUESTION_KEYS.some((key) => key in example)) example.question = '';
  return Object.keys(example).length ? example : undefined;
}

function formFields(raw: unknown): EnterpriseFormField[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((el): el is Record<string, unknown> => !!el && typeof el === 'object')
    .filter((el) => el.fieldType !== 'hidden')
    .map((el) => {
      const fieldName = String(el.fieldName || el.id || '');
      const fieldType = String(el.fieldType || 'text');
      const options =
        fieldType === 'dropdown'
          ? String(el.fieldOptions ?? '')
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean)
          : undefined;
      return {
        fieldName,
        label: String(el.label || fieldName || 'Field'),
        fieldType,
        required: el.requiredField === true,
        ...(options ? { options } : {}),
      };
    })
    .filter((f) => f.fieldName.length > 0);
}
