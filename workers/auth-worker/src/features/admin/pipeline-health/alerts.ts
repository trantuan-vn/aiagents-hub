import { UserDO } from '../../ws/infrastructure/UserDO.js';
import { getPrimaryAdminIdentifier } from '../../../shared/admin-config.js';
import { ALERTS_SENT_KV_KEY, type PipelineOverviewDto } from './domain.js';

type SentMap = Record<string, { overall: string; sentAt: string }>;

async function loadSent(env: Env): Promise<SentMap> {
  try {
    const raw = await env.SYSTEM_CONFIG_KV?.get(ALERTS_SENT_KV_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SentMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function hourBucket(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 13); // yyyy-mm-ddThh
}

async function notifyAdminInApp(env: Env, overview: PipelineOverviewDto): Promise<void> {
  try {
    const adminId = getPrimaryAdminIdentifier(env);
    const ns = env.USER_DO;
    const userDO = ns.get(ns.idFromName(adminId)) as DurableObjectStub<UserDO>;
    const stages = overview.stages
      .filter((s) => s.status === 'incident' || s.status === 'unavailable')
      .map((s) => `${s.stage}:${s.status}`)
      .join(', ');
    await userDO.fetch('https://user.internal/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'broadcast',
        message: {
          title: 'Data pipeline incident',
          body: `Overall ${overview.overall}. ${stages || 'Check pipeline health'}. Open incidents: ${overview.openCount}.`,
          data: {
            kind: 'pipeline_health_burst',
            overall: overview.overall,
            openCount: overview.openCount,
            stages: overview.stages.map((s) => ({ stage: s.stage, status: s.status })),
          },
        },
      }),
    });
  } catch {
    /* best-effort */
  }
}

/** In-app burst when overview is incident; dedupe per UTC hour. */
export async function dispatchPipelineBurstAlert(env: Env, overview: PipelineOverviewDto): Promise<boolean> {
  if (overview.overall !== 'incident') return false;
  const key = `incident:${hourBucket()}`;
  const sent = await loadSent(env);
  if (sent[key]?.overall === 'incident') return false;
  await notifyAdminInApp(env, overview);
  sent[key] = { overall: 'incident', sentAt: new Date().toISOString() };
  // Keep last ~48 hour buckets
  const pruned: SentMap = {};
  for (const [k, v] of Object.entries(sent)) {
    if (Date.now() - Date.parse(v.sentAt) < 48 * 60 * 60 * 1000) pruned[k] = v;
  }
  pruned[key] = sent[key];
  await env.SYSTEM_CONFIG_KV?.put(ALERTS_SENT_KV_KEY, JSON.stringify(pruned));
  return true;
}
