import { deriveCreditCoeffs, proposeCreditCoeffs, type CreditCoeffs, type BillingEconomics } from '../service/credit.js';
import { getServicePricing } from '../service/pricing.js';
import { classifyModelClass } from '../service/credit.js';
import type { ModelClass } from '../system-config/domain.js';

export const COEFF_PROPOSALS_KEY = 'aiagents-hub-credit-coeff-proposals';

export type ContributionClassRow = {
  modelClass: string;
  runs: number;
  creditsCharged: number;
  revenueUsd: number;
  cogsAiUsd: number;
  cogsInfraUsd: number;
  contributionUsd: number;
  contributionPct: number;
};

export type ContributionWorkflowRow = {
  workflowId: number;
  runs: number;
  revenueUsd: number;
  contributionUsd: number;
  contributionPct: number;
};

export type CoeffProposalRecord = {
  id: string;
  modelClass: ModelClass;
  observedContributionPct: number;
  current: CreditCoeffs;
  proposed: CreditCoeffs;
  deltaPct: number;
  emergency: boolean;
  notify: boolean;
  leadDaysPro: number;
  leadDaysEnt: number;
  status: 'proposed' | 'applied' | 'dismissed';
  createdAt: string;
  effectiveAtPro?: string;
  effectiveAtEnt?: string;
  appliedAt?: string;
};

export type ContributionReport = {
  hours: number;
  byClass: ContributionClassRow[];
  losingWorkflows: ContributionWorkflowRow[];
  blendedContributionPct: number;
  creditsCharged: number;
  revenueUsd: number;
  cogsAiUsd: number;
  proposals: CoeffProposalRecord[];
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function queryContributionByClass(
  db: D1Database,
  fromMs: number,
  toMs: number,
): Promise<ContributionClassRow[]> {
  const sql = `
    SELECT
      COALESCE(model_class, modelClass, 'unknown') as modelClass,
      COUNT(*) as runs,
      SUM(COALESCE(credits_charged, creditsCharged, 0)) as creditsCharged,
      SUM(COALESCE(revenue_usd, revenueUsd, cost, 0)) as revenueUsd,
      SUM(COALESCE(cogs_ai_usd, cogsAiUsd, 0)) as cogsAiUsd,
      SUM(COALESCE(cogs_infra_usd_est, cogsInfraUsdEst, 0)) as cogsInfraUsd,
      SUM(COALESCE(contribution_usd, contributionUsd, 0)) as contributionUsd
    FROM service_usages
    WHERE created_at >= ? AND created_at <= ?
      AND (isError = 0 OR isError IS NULL)
    GROUP BY COALESCE(model_class, modelClass, 'unknown')
  `;
  try {
    const result = await db.prepare(sql).bind(fromMs, toMs).all<Record<string, unknown>>();
    return (result.results ?? []).map((r) => {
      const revenueUsd = num(r.revenueUsd);
      const contributionUsd = num(r.contributionUsd);
      return {
        modelClass: String(r.modelClass ?? 'unknown'),
        runs: num(r.runs),
        creditsCharged: num(r.creditsCharged),
        revenueUsd,
        cogsAiUsd: num(r.cogsAiUsd),
        cogsInfraUsd: num(r.cogsInfraUsd),
        contributionUsd,
        contributionPct: revenueUsd > 0 ? Math.round((contributionUsd / revenueUsd) * 10000) / 100 : 0,
      };
    });
  } catch {
    return [];
  }
}

export async function queryLosingWorkflows(
  db: D1Database,
  fromMs: number,
  toMs: number,
  limit = 10,
): Promise<ContributionWorkflowRow[]> {
  const sql = `
    SELECT
      COALESCE(workflowId, workflow_id, 0) as workflowId,
      COUNT(*) as runs,
      SUM(COALESCE(revenue_usd, revenueUsd, cost, 0)) as revenueUsd,
      SUM(COALESCE(contribution_usd, contributionUsd, 0)) as contributionUsd
    FROM service_usages
    WHERE created_at >= ? AND created_at <= ?
      AND (isError = 0 OR isError IS NULL)
      AND COALESCE(workflowId, workflow_id, 0) > 0
    GROUP BY COALESCE(workflowId, workflow_id, 0)
    HAVING SUM(COALESCE(contribution_usd, contributionUsd, 0)) < 0
    ORDER BY contributionUsd ASC
    LIMIT ?
  `;
  try {
    const result = await db.prepare(sql).bind(fromMs, toMs, limit).all<Record<string, unknown>>();
    return (result.results ?? []).map((r) => {
      const revenueUsd = num(r.revenueUsd);
      const contributionUsd = num(r.contributionUsd);
      return {
        workflowId: num(r.workflowId),
        runs: num(r.runs),
        revenueUsd,
        contributionUsd,
        contributionPct: revenueUsd > 0 ? Math.round((contributionUsd / revenueUsd) * 10000) / 100 : 0,
      };
    });
  } catch {
    return [];
  }
}

export async function loadProposals(kv: KVNamespace | undefined): Promise<CoeffProposalRecord[]> {
  if (!kv) return [];
  try {
    const raw = await kv.get(COEFF_PROPOSALS_KEY, 'json');
    return Array.isArray(raw) ? (raw as CoeffProposalRecord[]) : [];
  } catch {
    return [];
  }
}

export async function saveProposals(kv: KVNamespace | undefined, rows: CoeffProposalRecord[]): Promise<void> {
  if (!kv) return;
  await kv.put(COEFF_PROPOSALS_KEY, JSON.stringify(rows.slice(0, 50)));
}

export function buildClassProposal(
  services: Record<string, unknown>[],
  modelClass: ModelClass,
  observedContributionPct: number,
  eco: BillingEconomics,
  now = new Date(),
): CoeffProposalRecord | null {
  const sample = services.find((s) => classifyModelClass(s) === modelClass);
  if (!sample) return null;
  const pricing = getServicePricing(sample);
  if (!pricing) return null;
  const current = deriveCreditCoeffs(pricing, modelClass, eco);
  const proposal = proposeCreditCoeffs({
    pricing,
    modelClass,
    eco,
    current,
    observedContributionPct,
  });
  const leadProMs = proposal.leadDaysPro * 24 * 60 * 60 * 1000;
  const leadEntMs = proposal.leadDaysEnt * 24 * 60 * 60 * 1000;
  return {
    id: `${modelClass}-${now.toISOString()}`,
    modelClass,
    observedContributionPct,
    current: proposal.current,
    proposed: proposal.proposed,
    deltaPct: proposal.deltaPct,
    emergency: proposal.emergency,
    notify: proposal.notify,
    leadDaysPro: proposal.leadDaysPro,
    leadDaysEnt: proposal.leadDaysEnt,
    status: proposal.emergency ? 'applied' : 'proposed',
    createdAt: now.toISOString(),
    effectiveAtPro: new Date(now.getTime() + leadProMs).toISOString(),
    effectiveAtEnt: new Date(now.getTime() + leadEntMs).toISOString(),
    appliedAt: proposal.emergency ? now.toISOString() : undefined,
  };
}

export function applyCoeffsToServices(
  services: Record<string, unknown>[],
  modelClass: ModelClass,
  coeffs: CreditCoeffs,
): Array<{ id: number; data: Record<string, unknown> }> {
  const updates: Array<{ id: number; data: Record<string, unknown> }> = [];
  for (const row of services) {
    if (classifyModelClass(row) !== modelClass) continue;
    const id = Number(row.id);
    if (!Number.isInteger(id) || id <= 0) continue;
    const version = Math.max(0, Math.floor(Number(row.creditRateVersion ?? row.credit_rate_version ?? 0) || 0)) + 1;
    updates.push({
      id,
      data: {
        ...row,
        creditCoeffInput: coeffs.input,
        creditCoeffOutput: coeffs.output,
        creditCoeffInputCache: coeffs.inputCache,
        creditRateVersion: version,
        modelClass,
        queueStatus: 'pending',
      },
    });
  }
  return updates;
}

export function memberCoeffNotices(proposals: CoeffProposalRecord[], planId: string, now = new Date()): Array<{
  modelClass: string;
  emergency: boolean;
  effectiveAt: string;
  deltaPct: number;
}> {
  const t = now.getTime();
  return proposals
    .filter((p) => p.status === 'proposed' || (p.status === 'applied' && p.emergency))
    .map((p) => {
      const effectiveAt = planId === 'enterprise' ? (p.effectiveAtEnt ?? p.createdAt) : (p.effectiveAtPro ?? p.createdAt);
      return {
        modelClass: p.modelClass,
        emergency: p.emergency,
        effectiveAt,
        deltaPct: p.deltaPct,
      };
    })
    .filter((n) => n.emergency || Date.parse(n.effectiveAt) >= t - 7 * 24 * 60 * 60 * 1000);
}
