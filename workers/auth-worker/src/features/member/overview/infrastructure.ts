import { UserDO } from '../../ws/infrastructure/UserDO';
import { executeUtils } from '../../../shared/utils';
import type { OverviewResponse, OverviewSubscription, OverviewApiKey, OverviewActivity } from './domain';

/** Counts from D1 service_usages (same source as monitor/logs). */
export async function getApiCallCountsFromD1(
  db: D1Database,
  userId: string,
): Promise<{ total: number; byServiceId: Map<number, number> }> {
  const totalRow = await db
    .prepare(`SELECT COUNT(*) as total FROM service_usages WHERE "user_id" = ?`)
    .bind(userId)
    .first<{ total: number }>();

  const byServiceResult = await db
    .prepare(
      `SELECT "serviceId", COUNT(*) as cnt FROM service_usages WHERE "user_id" = ? GROUP BY "serviceId"`,
    )
    .bind(userId)
    .all<{ serviceId: number; cnt: number }>();

  const byServiceId = new Map<number, number>();
  for (const row of byServiceResult.results ?? []) {
    byServiceId.set(row.serviceId, row.cnt);
  }

  return { total: totalRow?.total ?? 0, byServiceId };
}

export async function getOverviewData(
  userDO: DurableObjectStub<UserDO>,
  db?: D1Database,
  userId?: string,
): Promise<OverviewResponse> {
  const [services, tokens, serviceUsages, apiCallCounts] = await Promise.all([
    executeUtils.executeDynamicAction(
      userDO,
      'select',
      {
        where: { field: 'isActive', operator: '=', value: 1 },
        orderBy: { field: 'createdAt', direction: 'DESC' },
        limit: 20,
      },
      'services',
    ),
    getApiTokens(userDO),
    getRecentServiceUsages(userDO),
    db && userId ? getApiCallCountsFromD1(db, userId) : Promise.resolve(null),
  ]);

  const totalApiCalls = apiCallCounts?.total ?? 0;
  const activeSubscriptions = Array.isArray(services) ? services.length : 0;
  const activeTokens = Array.isArray(tokens)
    ? tokens.filter((t) => t.isActive && (!t.expiresAt || new Date(t.expiresAt) >= new Date())).length
    : 0;

  const subscriptions: OverviewSubscription[] = Array.isArray(services)
    ? services.map((s) => ({
        id: s.id,
        name: s.name || 'Service',
        endpoint: s.endpoint,
        plan: s.name,
        calls: apiCallCounts?.byServiceId.get(s.id) ?? 0,
        limit: 0,
        nextBilling: s.expiresAt ?? s.expires_at
          ? new Date(s.expiresAt ?? s.expires_at).toLocaleDateString('en-US')
          : null,
      }))
    : [];

  const apiKeys: OverviewApiKey[] = Array.isArray(tokens)
    ? tokens.slice(0, 5).map((t) => {
        const createdAt = t.createdAt ?? t.created_at;
        return {
          id: t.id,
          name: t.name,
          status: t.isActive && (!t.expiresAt || new Date(t.expiresAt) >= new Date()) ? 'active' as const : 'inactive' as const,
          lastUsed: null,
          expiresAt: t.expiresAt ?? null,
          createdAt: createdAt ? new Date(createdAt).toISOString() : new Date().toISOString(),
        };
      })
    : [];

  const recentActivity = buildRecentActivity(serviceUsages);

  return {
    stats: {
      totalApiCalls,
      activeSubscriptions,
      activeTokens,
    },
    subscriptions,
    apiKeys,
    recentActivity,
  };
}

async function getApiTokens(userDO: DurableObjectStub<UserDO>): Promise<any[]> {
  try {
    const tokens = await executeUtils.executeDynamicAction(userDO, 'select', {
      orderBy: { field: 'created_at', direction: 'DESC' },
      limit: 10,
    }, 'api_tokens');
    return Array.isArray(tokens) ? tokens : [];
  } catch {
    return [];
  }
}

async function getRecentServiceUsages(userDO: DurableObjectStub<UserDO>): Promise<any[]> {
  try {
    const usages = await executeUtils.executeDynamicAction(userDO, 'select', {
      orderBy: { field: 'created_at', direction: 'DESC' },
      limit: 10,
    }, 'service_usages');
    return Array.isArray(usages) ? usages : [];
  } catch {
    return [];
  }
}

function formatTimeAgo(dateInput: string | number | Date): string {
  const date = new Date(dateInput);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} mins ago`;
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

function buildRecentActivity(serviceUsages: any[]): OverviewActivity[] {
  const usages = serviceUsages || [];
  return usages.slice(0, 10).map((u) => {
    const ts = u.created_at ?? u.createdAt ?? Date.now();
    const isError = u.isError === true || u.isError === 1;
    return {
      action: 'API call',
      endpoint: u.endpoint || '/api',
      status: isError ? ('error' as const) : ('success' as const),
      time: formatTimeAgo(ts),
    };
  });
}
