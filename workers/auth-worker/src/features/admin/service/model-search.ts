import type { ModelSearchResult } from './domain';

const PROXY_MODEL_SUGGESTIONS: ModelSearchResult[] = [
  { id: 'openai/gpt-4o', name: 'GPT-4o', source: 'proxy' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', source: 'proxy' },
  { id: 'openai/gpt-4.1', name: 'GPT-4.1', source: 'proxy' },
  { id: 'openai/gpt-4.1-mini', name: 'GPT-4.1 Mini', source: 'proxy' },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat', source: 'proxy' },
  { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', source: 'proxy' },
  { id: 'google-ai-studio/gemini-2.0-flash', name: 'Gemini 2.0 Flash', source: 'proxy' },
];

function filterProxySuggestions(query: string): ModelSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return PROXY_MODEL_SUGGESTIONS.slice(0, 12);
  return PROXY_MODEL_SUGGESTIONS.filter(
    (m) => m.id.toLowerCase().includes(q) || m.name?.toLowerCase().includes(q),
  );
}

function isNumericId(value: string): boolean {
  return /^\d+$/.test(value.trim());
}

/** Normalize to Workers AI model id used by env.AI.run (e.g. @cf/mistralai/mistral-small-3.1-24b-instruct). */
function toWorkersAiModelId(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith('@cf/')) return trimmed;
  if (trimmed.startsWith('@cf')) {
    const rest = trimmed.slice(3).replace(/^\/+/, '');
    return rest ? `@cf/${rest}` : trimmed;
  }
  return `@cf/${trimmed.replace(/^\/+/, '')}`;
}

function collectStringFields(item: Record<string, unknown>): string[] {
  const keys = [
    'id',
    'name',
    'model',
    'model_id',
    'modelId',
    'slug',
    'source',
    'path',
    'canonical_slug',
    'description',
  ];
  const out: string[] = [];
  for (const key of keys) {
    const v = item[key];
    if (typeof v === 'string' && v.trim()) {
      const s = v.trim();
      if (!isNumericId(s)) out.push(s);
    }
  }
  return out;
}

function pickWorkersAiModelId(candidates: string[]): string | null {
  const cfFull = candidates.find((c) => c.startsWith('@cf/') && !isNumericId(c.replace(/^@cf\//, '')));
  if (cfFull) return cfFull;

  const pathLike = candidates.find((c) => c.includes('/') && !isNumericId(c.split('/')[0] ?? c));
  if (pathLike) return toWorkersAiModelId(pathLike);

  const nonNumeric = candidates.find((c) => !isNumericId(c) && c.length > 0);
  if (nonNumeric) return toWorkersAiModelId(nonNumeric);

  return null;
}

/** CF price entry: { unit, price, currency } per index in properties[property_id=price].value */
function parseCfPriceEntry(entry: unknown): number | undefined {
  if (typeof entry === 'number' && !Number.isNaN(entry) && entry >= 0) return entry;
  if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    const price = (entry as Record<string, unknown>).price;
    if (typeof price === 'number' && !Number.isNaN(price) && price >= 0) return price;
  }
  if (typeof entry === 'string') {
    const match = entry.replace(/,/g, '').match(/[\d.]+/);
    if (match) {
      const n = parseFloat(match[0]);
      if (!Number.isNaN(n) && n >= 0) return n;
    }
  }
  return undefined;
}

/** CF search: properties[] with property_id=price → value[0]=input, value[1]=output ($/1M tokens). */
function extractCfPricesFromProperties(item: Record<string, unknown>): {
  priceInput?: number;
  priceOutput?: number;
  priceInputCache?: number;
} {
  const props = item.properties;
  if (!Array.isArray(props)) return {};

  const priceProp = props.find((p) => {
    if (!p || typeof p !== 'object') return false;
    return (p as Record<string, unknown>).property_id === 'price';
  }) as Record<string, unknown> | undefined;

  if (!priceProp || !Array.isArray(priceProp.value)) return {};

  const values = priceProp.value;
  const priceInput = parseCfPriceEntry(values[0]);
  const priceOutput = parseCfPriceEntry(values[1]);
  const priceInputCache = parseCfPriceEntry(values[2]);
  return { priceInput, priceOutput, priceInputCache };
}

function mapCfModel(item: unknown): ModelSearchResult | null {
  if (!item || typeof item !== 'object') return null;
  const o = item as Record<string, unknown>;
  const modelId = pickWorkersAiModelId(collectStringFields(o));
  if (!modelId) return null;

  const rawName = typeof o.name === 'string' ? o.name.trim() : undefined;
  const displayName = rawName && !rawName.startsWith('@cf') ? rawName : undefined;
  const prices = extractCfPricesFromProperties(o);

  return {
    id: modelId,
    name: displayName ?? (rawName?.startsWith('@cf') ? rawName : undefined),
    description: typeof o.description === 'string' ? o.description : undefined,
    source: 'workers-ai',
    ...prices,
  };
}

export async function searchAiModels(env: Env, query: string): Promise<ModelSearchResult[]> {
  const proxy = filterProxySuggestions(query);
  const cf = await searchCfModels(env, query);
  const seen = new Set<string>();
  const merged: ModelSearchResult[] = [];
  for (const m of [...cf, ...proxy]) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    merged.push(m);
  }
  return merged.slice(0, 30);
}

async function searchCfModels(env: Env, query: string): Promise<ModelSearchResult[]> {
  let token: string;
  try {
    token = await env.CF_AI_API_TOKEN.get();
  } catch {
    return [];
  }
  if (!token) return [];

  const accountId = env.ACCOUNT_ID;
  const url = new URL(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search`);
  const q = query.trim();
  if (q) url.searchParams.set('search', q);
  url.searchParams.set('per_page', '20');

  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      console.warn('[Service] CF model search failed:', res.status, await res.text());
      return [];
    }
    const body = (await res.json()) as { result?: unknown[] };
    const list = Array.isArray(body.result) ? body.result : [];
    return list.map(mapCfModel).filter((m): m is ModelSearchResult => m !== null);
  } catch (e) {
    console.warn('[Service] CF model search error:', e);
    return [];
  }
}
