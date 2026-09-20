import { UserDO } from '../../ws/infrastructure/UserDO.js';
import { getPrimaryAdminIdentifier } from '../../../shared/admin-config.js';
import { sendViaPlatformEmail } from '../../member/workflows/nodes/human-review/gmail/platform-email.js';
import { ALERTS_SENT_KV_KEY } from './domain.js';
import { projectedOverEarlyWarnings, type ProjectedOverWarning } from './phase3.js';
import type { UsageMetricRow } from './domain.js';

type SentMap = Record<string, { exhaustAt: string; sentAt: string }>;

async function loadSent(env: Env): Promise<SentMap> {
  try {
    const raw = await env.SYSTEM_CONFIG_KV.get(ALERTS_SENT_KV_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SentMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function warningKey(row: ProjectedOverWarning): string {
  return `${row.metricId}:${row.exhaustAt.slice(0, 10)}`;
}

async function notifyAdminInApp(env: Env, warning: ProjectedOverWarning): Promise<void> {
  try {
    const adminId = getPrimaryAdminIdentifier(env);
    const ns = env.USER_DO;
    const userDO = ns.get(ns.idFromName(adminId)) as DurableObjectStub<UserDO>;
    const days = String(warning.daysAhead);
    await userDO.fetch('https://user.internal/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'broadcast',
        message: {
          title: 'Cloudflare included allotment',
          body: `${warning.label} is projected over in ${days} days (${warning.exhaustAt.slice(0, 10)}).`,
          data: {
            kind: 'cloudflare_usage_projected_over',
            metricId: warning.metricId,
            exhaustAt: warning.exhaustAt,
            daysAhead: warning.daysAhead,
          },
        },
      }),
    });
  } catch {
    /* in-app is best-effort */
  }
}

async function emailAdmin(env: Env, warnings: ProjectedOverWarning[]): Promise<void> {
  const to = getPrimaryAdminIdentifier(env);
  if (!to.includes('@')) return;
  const lines = warnings.map(
    (w) => `- ${w.label} (${w.metricId}): exhaust ${w.exhaustAt.slice(0, 10)} (${w.daysAhead} days), projected overage $${w.overageUsdProjected.toFixed(2)}`,
  );
  await sendViaPlatformEmail(env, {
    to,
    subject: `[Hub FinOps] ${warnings.length} Cloudflare metric(s) projected over (≥5 days)`,
    text: [
      'Cloudflare included allotment is projected to run out at least 5 days from now.',
      '',
      ...lines,
      '',
      'Open https://aiagents-hub.vn/dashboard/cloudflare-usage (admin step-up). This is internal COGS, not a customer invoice.',
    ].join('\n'),
  });
}

export async function dispatchProjectedOverAlerts(env: Env, metrics: UsageMetricRow[], now = new Date()): Promise<number> {
  const warnings = projectedOverEarlyWarnings(metrics, now);
  if (!warnings.length) return 0;
  const sent = await loadSent(env);
  const fresh = warnings.filter((w) => sent[warningKey(w)]?.exhaustAt !== w.exhaustAt);
  if (!fresh.length) return 0;
  try {
    await emailAdmin(env, fresh);
  } catch {
    /* keep trying in-app even if email fails */
  }
  for (const w of fresh) {
    await notifyAdminInApp(env, w);
    sent[warningKey(w)] = { exhaustAt: w.exhaustAt, sentAt: now.toISOString() };
  }
  await env.SYSTEM_CONFIG_KV.put(ALERTS_SENT_KV_KEY, JSON.stringify(sent));
  return fresh.length;
}
