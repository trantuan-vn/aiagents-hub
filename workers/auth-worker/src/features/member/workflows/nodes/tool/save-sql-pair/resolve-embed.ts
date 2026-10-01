import { modelIdToServiceEndpoint } from '../../../../../admin/service/model-search.js';
import type { UserDO } from '../../../../../ws/infrastructure/UserDO.js';
import {
  findApprovedServiceByEndpoint,
  findApprovedServiceByModel,
  listApprovedServices,
  resolveServiceByEndpoint,
} from '../../../billing/billing.js';
import { resolveEmbedModelFromService, type ResolvedRagEmbed } from '../shared/rag-context.js';

/** Approved service whose model, endpoint, or catalog id is an embedding model. */
export function serviceLooksLikeEmbed(service: Record<string, unknown>): boolean {
  const blob = [
    service.model,
    service.embedModel,
    service.embed_model,
    service.catalogId,
    service.catalog_id,
    service.endpoint,
    service.name,
  ]
    .map((value) => String(value ?? '').toLowerCase())
    .join(' ');
  return blob.includes('bge') || blob.includes('embed');
}

export type SqlPairEmbed = ResolvedRagEmbed & { catalogId: string };

function toEmbed(
  service: Record<string, unknown>,
  fallbackEndpoint: string,
  configured: string,
  label: string,
): SqlPairEmbed {
  if (!serviceLooksLikeEmbed(service)) {
    throw new Error(`${label}: selected service is not an embedding model`);
  }
  const endpoint = String(service.endpoint ?? fallbackEndpoint).trim();
  const catalogId = String(service.catalogId ?? service.catalog_id ?? '').trim() || configured || endpoint;
  return {
    model: resolveEmbedModelFromService(service),
    service,
    endpoint,
    catalogId,
  };
}

function matchesConfigured(service: Record<string, unknown>, value: string): boolean {
  return [service.catalogId, service.catalog_id, service.endpoint, service.model, service.embedModel, service.embed_model]
    .some((candidate) => String(candidate ?? '').trim() === value);
}

/** Resolve the combo value (catalog id or embed endpoint) to a model id. Empty picks the first embed service. */
export async function resolveSqlPairEmbed(
  configured: unknown,
  userDO?: DurableObjectStub<UserDO>,
  label = 'save_sql_pair',
): Promise<SqlPairEmbed> {
  if (!userDO) throw new Error(`${label}: embed model is required`);
  const value = String(configured ?? '').trim();
  if (!value) {
    const listed = await listApprovedServices(userDO);
    const first = listed.find(serviceLooksLikeEmbed);
    if (!first) throw new Error(`${label}: no embedding service in the catalog`);
    return toEmbed(first, String(first.endpoint ?? ''), '', label);
  }
  if (value.startsWith('/')) {
    const service = await resolveServiceByEndpoint(userDO, value);
    return toEmbed(service, value, value, label);
  }
  const byModel = await findApprovedServiceByModel(userDO, value);
  if (byModel) return toEmbed(byModel, String(byModel.endpoint ?? ''), value, label);
  if (value.startsWith('@') || value.includes('/')) {
    const endpoint = modelIdToServiceEndpoint(value);
    const byEndpoint = await findApprovedServiceByEndpoint(userDO, endpoint);
    if (byEndpoint) return toEmbed(byEndpoint, endpoint, value, label);
  }
  const listed = await listApprovedServices(userDO);
  const match = listed.find((service) => matchesConfigured(service, value) && serviceLooksLikeEmbed(service));
  if (match) return toEmbed(match, String(match.endpoint ?? ''), value, label);
  throw new Error(`${label}: embed service not found for "${value}"`);
}
