import { getBillingEconomicsFromEnv } from '../service/get-billing-economics.js';
import {
  DEFAULT_BILLING_CONFIG,
  KV_KEY,
  SystemConfigSchema,
} from '../system-config/domain.js';
import { readSystemConfigText, rememberSystemConfigText } from '../system-config/read-cached.js';
import {
  CloudflareUsageError,
  INFRA_BUFFER_PROPOSAL_KV_KEY,
} from './domain.js';
import { proposedInfraBufferPct, shouldProposeInfraBuffer } from './phase3.js';

export type InfraBufferProposal = {
  status: 'none' | 'proposed' | 'applied' | 'dismissed';
  currentPct: number;
  proposedPct: number | null;
  totalUsdProjected: number;
  cogsAiUsd30d: number;
  because: string;
  updatedAt: string;
};

export async function queryCogsAiUsd30d(db: D1Database | undefined, now = new Date()): Promise<number> {
  if (!db) return 0;
  const from = now.getTime() - 30 * 86_400_000;
  try {
    const row = await db
      .prepare(
        `SELECT SUM(COALESCE("cogsAiUsd", 0)) as usd
         FROM service_usages
         WHERE created_at >= ? AND created_at <= ?
           AND (isError = 0 OR isError IS NULL)`,
      )
      .bind(from, now.getTime())
      .first<{ usd: number | null }>();
    const usd = Number(row?.usd);
    return Number.isFinite(usd) ? usd : 0;
  } catch {
    return 0;
  }
}

async function loadStored(env: Env): Promise<InfraBufferProposal | null> {
  try {
    const raw = await env.SYSTEM_CONFIG_KV.get(INFRA_BUFFER_PROPOSAL_KV_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as InfraBufferProposal;
  } catch {
    return null;
  }
}

export async function getInfraBufferProposal(
  env: Env,
  totalUsdProjected: number,
  now = new Date(),
): Promise<InfraBufferProposal> {
  const eco = await getBillingEconomicsFromEnv(env);
  const cogsAiUsd30d = await queryCogsAiUsd30d(env.D1DB, now);
  const proposedPct = proposedInfraBufferPct(totalUsdProjected, cogsAiUsd30d);
  const stored = await loadStored(env);
  const because =
    proposedPct == null
      ? 'Need both projected Cloudflare COGS and 30-day AI COGS to propose a buffer.'
      : `Projected Cloudflare COGS $${totalUsdProjected.toFixed(2)} vs AI COGS $${cogsAiUsd30d.toFixed(2)} over 30 days → infra_buffer ${proposedPct}% (current ${eco.infraBufferPct}%).`;
  if (stored?.status === 'dismissed' && stored.proposedPct === proposedPct) {
    return { ...stored, currentPct: eco.infraBufferPct, totalUsdProjected, cogsAiUsd30d, because };
  }
  if (stored?.status === 'applied' && stored.proposedPct === eco.infraBufferPct) {
    return { ...stored, currentPct: eco.infraBufferPct, totalUsdProjected, cogsAiUsd30d, because };
  }
  if (!shouldProposeInfraBuffer(eco.infraBufferPct, proposedPct)) {
    return {
      status: 'none',
      currentPct: eco.infraBufferPct,
      proposedPct,
      totalUsdProjected,
      cogsAiUsd30d,
      because,
      updatedAt: now.toISOString(),
    };
  }
  return {
    status: 'proposed',
    currentPct: eco.infraBufferPct,
    proposedPct,
    totalUsdProjected,
    cogsAiUsd30d,
    because,
    updatedAt: stored?.updatedAt ?? now.toISOString(),
  };
}

export async function upsertInfraBufferProposal(env: Env, totalUsdProjected: number, now = new Date()): Promise<InfraBufferProposal> {
  const next = await getInfraBufferProposal(env, totalUsdProjected, now);
  if (next.status === 'proposed') {
    await env.SYSTEM_CONFIG_KV.put(INFRA_BUFFER_PROPOSAL_KV_KEY, JSON.stringify(next));
  }
  return next;
}

export async function confirmInfraBufferProposal(env: Env, actor: string): Promise<InfraBufferProposal> {
  const stored = await loadStored(env);
  const live = await getInfraBufferProposal(env, stored?.totalUsdProjected ?? 0);
  const proposedPct = live.proposedPct ?? stored?.proposedPct;
  if (proposedPct == null) {
    throw new CloudflareUsageError('apply_confirm_required', 'No infra_buffer proposal to confirm', 400);
  }
  await patchBillingInfraBuffer(env, proposedPct);
  const applied: InfraBufferProposal = {
    ...live,
    status: 'applied',
    currentPct: proposedPct,
    proposedPct,
    updatedAt: new Date().toISOString(),
  };
  await env.SYSTEM_CONFIG_KV.put(INFRA_BUFFER_PROPOSAL_KV_KEY, JSON.stringify(applied));
  void actor;
  return applied;
}

export async function dismissInfraBufferProposal(env: Env): Promise<InfraBufferProposal> {
  const live = await getInfraBufferProposal(env, (await loadStored(env))?.totalUsdProjected ?? 0);
  const dismissed: InfraBufferProposal = {
    ...live,
    status: 'dismissed',
    updatedAt: new Date().toISOString(),
  };
  await env.SYSTEM_CONFIG_KV.put(INFRA_BUFFER_PROPOSAL_KV_KEY, JSON.stringify(dismissed));
  return dismissed;
}

async function patchBillingInfraBuffer(env: Env, infraBufferPct: number): Promise<void> {
  const kv = env.SYSTEM_CONFIG_KV;
  let existing: Record<string, unknown> = {};
  try {
    const raw = await readSystemConfigText(kv);
    if (raw) existing = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    existing = {};
  }
  const billing = {
    ...DEFAULT_BILLING_CONFIG,
    ...((existing.billing as object | undefined) ?? {}),
    INFRA_BUFFER_PCT: infraBufferPct,
  };
  const merged = {
    ...existing,
    billing,
  };
  const validated = SystemConfigSchema.parse(merged);
  const payload = JSON.stringify({
    ...existing,
    ...validated,
    billing: { ...(existing.billing as object), ...validated.billing },
  });
  await kv.put(KV_KEY, payload);
  rememberSystemConfigText(payload);
}
