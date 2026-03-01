import { UserDO } from '../../ws/infrastructure/UserDO';
import { executeUtils } from '../../../shared/utils';
import type { OverviewResponse, OverviewSubscription, OverviewApiKey, OverviewActivity } from './domain';

export async function getOverviewData(userDO: DurableObjectStub<UserDO>): Promise<OverviewResponse> {
  const [services, tokens, serviceUsages] = await Promise.all([
    executeUtils.executeDynamicAction(userDO, 'select', {
      where: { field: 'isActive', operator: '=', value: 1 },
      orderBy: { field: 'createdAt', direction: 'DESC' },
      limit: 20,
    }, 'services'),
    getApiTokens(userDO),
    getRecentServiceUsages(userDO),
  ]);

  const totalApiCalls = Array.isArray(services)
    ? services.reduce((sum, s) => sum + (Number(s.currentCalls ?? s.current_calls) || 0), 0)
    : 0;
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
        calls: Number(s.currentCalls ?? s.current_calls) || 0,
        limit: Number(s.maxCalls ?? s.max_calls) || 0,
        nextBilling: (s.expiresAt ?? s.expires_at) ? new Date(s.expiresAt ?? s.expires_at).toLocaleDateString('en-US') : null,
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
    return {
      action: 'API call',
      endpoint: u.endpoint || '/api',
      status: 'success' as const,
      time: formatTimeAgo(ts),
    };
  });
}
