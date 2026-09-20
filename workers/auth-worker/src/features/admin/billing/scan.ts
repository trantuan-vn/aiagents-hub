import { executeUtils } from '../../../shared/utils.js';
import { getPrimaryAdminIdentifier } from '../../../shared/admin-config.js';
import { UserDO } from '../../ws/infrastructure/UserDO.js';
import { getBillingEconomicsFromEnv } from '../service/get-billing-economics.js';
import type { ModelClass } from '../system-config/domain.js';
import {
  applyCoeffsToServices,
  buildClassProposal,
  loadProposals,
  queryContributionByClass,
  queryLosingWorkflows,
  saveProposals,
  type CoeffProposalRecord,
  type ContributionReport,
} from './contribution.js';
import { upsertInfraBufferProposal } from '../cloudflare-usage/infra-buffer.js';
import { latestSnapshot } from '../cloudflare-usage/infrastructure.js';

const CLASSES: ModelClass[] = ['tiny', 'mid', 'frontier'];

export async function getContributionReport(
  env: Env,
  hours = 24,
): Promise<ContributionReport> {
  const to = Date.now();
  const from = to - Math.max(1, hours) * 60 * 60 * 1000;
  const db = env.D1DB;
  const byClass = db ? await queryContributionByClass(db, from, to) : [];
  const losingWorkflows = db ? await queryLosingWorkflows(db, from, to) : [];
  const revenueUsd = byClass.reduce((s, r) => s + r.revenueUsd, 0);
  const contributionUsd = byClass.reduce((s, r) => s + r.contributionUsd, 0);
  const proposals = await loadProposals(env.SYSTEM_CONFIG_KV);
  const snap = await latestSnapshot(env);
  const infraBuffer = await upsertInfraBufferProposal(env, snap?.payload.summary.totalUsdProjected ?? 0);
  return {
    hours,
    byClass,
    losingWorkflows,
    blendedContributionPct: revenueUsd > 0 ? Math.round((contributionUsd / revenueUsd) * 10000) / 100 : 0,
    creditsCharged: byClass.reduce((s, r) => s + r.creditsCharged, 0),
    revenueUsd,
    cogsAiUsd: byClass.reduce((s, r) => s + r.cogsAiUsd, 0),
    proposals,
    infraBuffer,
  };
}

async function loadAdminServices(env: Env): Promise<{
  userDO: DurableObjectStub<UserDO>;
  services: Record<string, unknown>[];
}> {
  const adminId = getPrimaryAdminIdentifier(env);
  const ns = env.USER_DO;
  const userDO = ns.get(ns.idFromName(adminId)) as DurableObjectStub<UserDO>;
  const rows = await executeUtils.executeDynamicAction(userDO, 'select', {}, 'services');
  const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
  return { userDO, services: list.filter((r) => r && typeof r === 'object') as Record<string, unknown>[] };
}

async function persistServiceUpdates(
  userDO: DurableObjectStub<UserDO>,
  updates: Array<{ id: number; data: Record<string, unknown> }>,
): Promise<number> {
  if (!updates.length) return 0;
  await executeUtils.executeDynamicAction(userDO, 'multi-table', {
    operations: updates.map((u) => ({
      table: 'services',
      operation: 'update' as const,
      id: u.id,
      data: u.data,
    })),
  });
  return updates.length;
}

export async function scanContributionAndPropose(env: Env, now = new Date()): Promise<{
  created: number;
  appliedEmergency: number;
  report: ContributionReport;
}> {
  const eco = await getBillingEconomicsFromEnv(env);
  const report = await getContributionReport(env, 24);
  const { userDO, services } = await loadAdminServices(env);
  const existing = report.proposals.filter((p) => p.status === 'proposed');
  const next: CoeffProposalRecord[] = [...existing];
  let created = 0;
  let appliedEmergency = 0;

  for (const cls of CLASSES) {
    const row = report.byClass.find((r) => r.modelClass === cls);
    if (!row || row.revenueUsd <= 0) continue;
    const floor = eco.floorContributionPct[cls];
    if (row.contributionPct >= floor) continue;
    if (existing.some((p) => p.modelClass === cls)) continue;
    const proposal = buildClassProposal(services, cls, row.contributionPct, eco, now);
    if (!proposal) continue;
    if (proposal.emergency) {
      const updates = applyCoeffsToServices(services, cls, proposal.proposed);
      await persistServiceUpdates(userDO, updates);
      appliedEmergency += 1;
    }
    next.unshift(proposal);
    created += 1;
  }

  await saveProposals(env.SYSTEM_CONFIG_KV, next);
  return { created, appliedEmergency, report: { ...report, proposals: next } };
}

export async function confirmCoeffProposal(env: Env, proposalId: string): Promise<CoeffProposalRecord> {
  const proposals = await loadProposals(env.SYSTEM_CONFIG_KV);
  const idx = proposals.findIndex((p) => p.id === proposalId);
  if (idx < 0) throw new Error('Proposal not found');
  const row = proposals[idx];
  if (row.status !== 'proposed') return row;
  const { userDO, services } = await loadAdminServices(env);
  const updates = applyCoeffsToServices(services, row.modelClass, row.proposed);
  await persistServiceUpdates(userDO, updates);
  const applied: CoeffProposalRecord = { ...row, status: 'applied', appliedAt: new Date().toISOString() };
  proposals[idx] = applied;
  await saveProposals(env.SYSTEM_CONFIG_KV, proposals);
  return applied;
}

export async function dismissCoeffProposal(env: Env, proposalId: string): Promise<CoeffProposalRecord> {
  const proposals = await loadProposals(env.SYSTEM_CONFIG_KV);
  const idx = proposals.findIndex((p) => p.id === proposalId);
  if (idx < 0) throw new Error('Proposal not found');
  const applied: CoeffProposalRecord = { ...proposals[idx], status: 'dismissed' };
  proposals[idx] = applied;
  await saveProposals(env.SYSTEM_CONFIG_KV, proposals);
  return applied;
}
