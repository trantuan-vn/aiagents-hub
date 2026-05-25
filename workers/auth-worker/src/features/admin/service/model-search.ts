import type { ModelSearchResult, PendingServiceFromModel } from './domain';
import { filterPopularGatewayModels, listPopularAiGatewayModels } from './gateway-models';

/** Providers on AI Gateway unified billing (provider/model, no @cf prefix). */
const GATEWAY_ONLY_PROVIDERS = new Set([
  'openai',
  'anthropic',
  'google-ai-studio',
  'google',
  'groq',
  'cerebras',
  'grok',
  'deepseek',
  'mistral',
  'x-ai',
  'cohere',
  'perplexity-ai',
  'azure',
  'amazon',
]);

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

function isGatewayProviderModelId(id: string): boolean {
  const t = id.trim();
  if (!t || t.startsWith('@cf/') || !t.includes('/')) return false;
  const provider = t.split('/')[0]?.toLowerCase() ?? '';
  return GATEWAY_ONLY_PROVIDERS.has(provider);
}

/** Preserve AI Gateway ids; prefix Workers AI catalog paths with @cf/. */
export function normalizeCatalogModelId(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  if (t.startsWith('@cf/')) return t;
  if (isGatewayProviderModelId(t)) return t;
  if (t.includes('/')) return toWorkersAiModelId(t);
  return toWorkersAiModelId(t);
}

function pickCatalogModelId(candidates: string[]): string | null {
  const cfFull = candidates.find((c) => c.startsWith('@cf/') && !isNumericId(c.replace(/^@cf\//, '')));
  if (cfFull) return cfFull;

  const gateway = candidates.find((c) => isGatewayProviderModelId(c));
  if (gateway) return gateway.trim();

  const pathLike = candidates.find((c) => c.includes('/') && !isNumericId(c.split('/')[0] ?? c));
  if (pathLike) return normalizeCatalogModelId(pathLike);

  const nonNumeric = candidates.find((c) => !isNumericId(c) && c.length > 0);
  if (nonNumeric) return normalizeCatalogModelId(nonNumeric);

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

function mapCatalogModel(item: unknown): ModelSearchResult | null {
  if (!item || typeof item !== 'object') return null;
  const o = item as Record<string, unknown>;
  const modelId = pickCatalogModelId(collectStringFields(o));
  if (!modelId) return null;

  const rawName = typeof o.name === 'string' ? o.name.trim() : undefined;
  const displayName = rawName && !rawName.startsWith('@cf') ? rawName : undefined;
  const prices = extractCfPricesFromProperties(o);
  const isGateway = isGatewayProviderModelId(modelId);

  return {
    id: modelId,
    name: displayName ?? (rawName?.startsWith('@cf') ? rawName : undefined),
    description: typeof o.description === 'string' ? o.description : undefined,
    source: isGateway ? 'gateway' : 'workers-ai',
    priceInput: prices.priceInput,
    priceOutput: prices.priceOutput ?? 0,
    priceInputCache: prices.priceInputCache,
  };
}

function mergeModelResults(primary: ModelSearchResult[], secondary: ModelSearchResult[]): ModelSearchResult[] {
  const byId = new Map<string, ModelSearchResult>();
  for (const m of secondary) {
    if (!byId.has(m.id)) byId.set(m.id, m);
  }
  for (const m of primary) {
    byId.set(m.id, m);
  }
  return [...byId.values()];
}

/** Stable API path per Workers AI model id (unique on services.endpoint). */
export function modelIdToServiceEndpoint(modelId: string): string {
  const slug = modelId
    .trim()
    .replace(/^@cf\//, '')
    .replace(/^@cf/, '')
    .replace(/^\/+/, '');
  return `/api/ai/${slug}`;
}

function displayNameFromModel(model: ModelSearchResult): string {
  if (model.name?.trim()) return model.name.trim().slice(0, 100);
  const id = model.id.replace(/^@cf\//, '');
  const part = id.split('/').pop() ?? id;
  return part.replace(/-/g, ' ').slice(0, 100) || model.id.slice(0, 100);
}

export function modelSearchHitToPendingService(
  model: ModelSearchResult,
  feePercent = 100,
): PendingServiceFromModel {
  return {
    name: displayNameFromModel(model),
    endpoint: modelIdToServiceEndpoint(model.id),
    model: model.id,
    priceInput: model.priceInput,
    priceOutput: model.priceOutput ?? 0,
    priceInputCache: model.priceInputCache,
    approvalStatus: 'pending',
    isActive: false,
    feePercent,
  };
}

/** Paginate Cloudflare AI model catalog (@cf Workers AI + AI Gateway provider models). */
export async function listAllCatalogModels(env: Env): Promise<ModelSearchResult[]> {
  let token: string;
  try {
    token = await env.CF_AI_API_TOKEN.get();
  } catch {
    return [];
  }
  if (!token) return [];

  const accountId = env.ACCOUNT_ID;
  const seen = new Set<string>();
  const merged: ModelSearchResult[] = [];
  const perPage = 50;
  let page = 1;
  const maxPages = 40;

  while (page <= maxPages) {
    const url = new URL(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search`);
    url.searchParams.set('per_page', String(perPage));
    url.searchParams.set('page', String(page));

    try {
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        console.warn('[Service] CF list models failed:', res.status, await res.text());
        break;
      }
      const body = (await res.json()) as {
        result?: unknown[];
        result_info?: { total_pages?: number; page?: number };
      };
      const list = Array.isArray(body.result) ? body.result : [];
      if (list.length === 0) break;

      for (const item of list) {
        const mapped = mapCatalogModel(item);
        if (!mapped || seen.has(mapped.id)) continue;
        seen.add(mapped.id);
        merged.push(mapped);
      }

      const totalPages = body.result_info?.total_pages;
      if (typeof totalPages === 'number' && page >= totalPages) break;
      if (list.length < perPage) break;
      page += 1;
    } catch (e) {
      console.warn('[Service] CF list models error:', e);
      break;
    }
  }

  return merged;
}

/** @deprecated Use listAllCatalogModels */
export const listAllCfModels = listAllCatalogModels;

/** CF catalog + curated AI Gateway models for admin scan. */
export async function listAllModelsForServiceScan(env: Env): Promise<ModelSearchResult[]> {
  const catalog = await listAllCatalogModels(env);
  const popular = listPopularAiGatewayModels();
  return mergeModelResults(catalog, popular);
}

export async function searchAiModels(env: Env, query: string): Promise<ModelSearchResult[]> {
  const proxy = filterPopularGatewayModels(query);
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
    return list.map(mapCatalogModel).filter((m): m is ModelSearchResult => m !== null);
  } catch (e) {
    console.warn('[Service] CF model search error:', e);
    return [];
  }
}
