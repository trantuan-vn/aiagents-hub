/**
 * `node.data.enterpriseTriggerKey` (§3.5): a UUID per invokable trigger node. Grants and credentials
 * point at the key, never at the canvas id or the kind.
 */

export type EnterpriseTriggerKind = 'webhook' | 'chat' | 'form' | 'schedule';

export type EnterpriseTrigger = {
  triggerKey: string;
  nodeId: string;
  kind: EnterpriseTriggerKind;
  label: string;
};

type RawNode = { id?: unknown; type?: unknown; data?: Record<string, unknown> | null };

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

function parseNodes(raw: unknown): { doc: Record<string, unknown>; nodes: RawNode[] } | null {
  try {
    const doc = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!doc || typeof doc !== 'object' || !Array.isArray((doc as { nodes?: unknown }).nodes)) return null;
    return { doc: doc as Record<string, unknown>, nodes: (doc as { nodes: RawNode[] }).nodes };
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
  const out: EnterpriseTrigger[] = [];
  for (const node of parseNodes(definition)?.nodes ?? []) {
    const kind = enterpriseTriggerKind(node);
    const key = keyOf(node);
    if (!kind || !key || typeof node.id !== 'string') continue;
    const data = node.data ?? {};
    const label = String(data.label ?? data.title ?? data.name ?? kind);
    out.push({ triggerKey: key, nodeId: node.id, kind, label });
  }
  return out;
}
