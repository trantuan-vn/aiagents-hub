import { Context } from 'hono';
import { getIdFromName } from '../../../shared/utils';
import { UserDO } from '../../ws/infrastructure/UserDO';
import { parseEarningsPayoutCassoMapping } from './casso-payout';
import {
  createEarningsPayoutInfrastructure,
  payoutKey,
} from './infrastructure';
import {
  currentPeriod,
  enumeratePeriods,
  getEarliestEarningPeriod,
  mergePeriodEarnings,
} from './d1';
import { createPayoutBeneficiaryInfrastructure } from '../../member/payout/beneficiary-infrastructure';

export const COMMISSION_ADMIN_IDENTIFIER = 'tuanta2021@gmail.com';

export interface PayoutPeriodRow {
  period: string;
  commissionAmountVnd: number;
  workflowRoyaltyAmountVnd: number;
  totalAmountVnd: number;
  bankStatus: 'paid' | 'unpaid';
  paidAt?: string;
}

export interface AggregatedPayoutItem {
  recipientUserId: string;
  recipientIdentifier: string;
  commissionAmountVnd: number;
  workflowRoyaltyAmountVnd: number;
  totalAmountVnd: number;
  bankStatus: 'paid' | 'unpaid';
  hasBeneficiary: boolean;
  periods: PayoutPeriodRow[];
}

export async function syncAllPeriodPayoutRecords(
  db: D1Database,
  payoutInfra: ReturnType<typeof createEarningsPayoutInfrastructure>,
): Promise<Map<string, import('./domain').EarningsPayout>> {
  const fromPeriod = await getEarliestEarningPeriod(db);
  const periods = enumeratePeriods(fromPeriod, currentPeriod());
  const allRecords = new Map<string, import('./domain').EarningsPayout>();

  for (const period of periods) {
    const earnings = await mergePeriodEarnings(db, period);
    const paidRecords = await payoutInfra.listByPeriod(period);
    const paidByUser = new Map(paidRecords.map((p) => [p.recipientUserId, p]));

    for (const row of earnings) {
      const key = payoutKey(period, row.recipientUserId);
      const existing = paidByUser.get(row.recipientUserId);
      if (!existing) {
        await payoutInfra.upsertPending({
          payoutKey: key,
          period,
          recipientUserId: row.recipientUserId,
          recipientIdentifier: row.recipientIdentifier,
          commissionAmountVnd: row.commissionAmountVnd,
          workflowRoyaltyAmountVnd: row.workflowRoyaltyAmountVnd,
          totalAmountVnd: row.totalAmountVnd,
          status: 'pending',
        });
      } else if (existing.status !== 'paid') {
        await payoutInfra.upsertPending({
          ...existing,
          commissionAmountVnd: row.commissionAmountVnd,
          workflowRoyaltyAmountVnd: row.workflowRoyaltyAmountVnd,
          totalAmountVnd: row.totalAmountVnd,
          status: 'pending',
        });
      }
    }

    const updated = await payoutInfra.listByPeriod(period);
    for (const p of updated) {
      allRecords.set(p.payoutKey, p);
    }
  }

  return allRecords;
}

export function buildAggregatedPayoutList(
  allRecords: Map<string, import('./domain').EarningsPayout>,
): AggregatedPayoutItem[] {
  const byUser = new Map<string, AggregatedPayoutItem>();

  for (const record of allRecords.values()) {
    if (record.status === 'paid') continue;
    if (record.totalAmountVnd <= 0) continue;

    let agg = byUser.get(record.recipientUserId);
    if (!agg) {
      agg = {
        recipientUserId: record.recipientUserId,
        recipientIdentifier: record.recipientIdentifier,
        commissionAmountVnd: 0,
        workflowRoyaltyAmountVnd: 0,
        totalAmountVnd: 0,
        bankStatus: 'unpaid',
        hasBeneficiary: false,
        periods: [],
      };
      byUser.set(record.recipientUserId, agg);
    }

    agg.commissionAmountVnd += record.commissionAmountVnd;
    agg.workflowRoyaltyAmountVnd += record.workflowRoyaltyAmountVnd;
    agg.totalAmountVnd += record.totalAmountVnd;
    agg.periods.push({
      period: record.period,
      commissionAmountVnd: record.commissionAmountVnd,
      workflowRoyaltyAmountVnd: record.workflowRoyaltyAmountVnd,
      totalAmountVnd: record.totalAmountVnd,
      bankStatus: 'unpaid',
      paidAt: record.paidAt,
    });
  }

  const items = [...byUser.values()];
  items.sort((a, b) => b.totalAmountVnd - a.totalAmountVnd);
  for (const item of items) {
    item.periods.sort((a, b) => b.period.localeCompare(a.period));
  }
  return items;
}

export async function attachBeneficiaries(
  c: Context,
  bindingName: string,
  items: AggregatedPayoutItem[],
): Promise<AggregatedPayoutItem[]> {
  const binding = c.env[bindingName as keyof Env] as DurableObjectNamespace;
  return Promise.all(
    items.map(async (row) => {
      let hasBeneficiary = false;
      try {
        const stub = binding.get(binding.idFromString(row.recipientUserId)) as DurableObjectStub<UserDO>;
        const beneficiary = await createPayoutBeneficiaryInfrastructure(stub).get();
        hasBeneficiary = !!beneficiary;
      } catch {
        hasBeneficiary = false;
      }
      return { ...row, hasBeneficiary };
    }),
  );
}

export async function getUnpaidPayoutKeysForUser(
  db: D1Database,
  payoutInfra: ReturnType<typeof createEarningsPayoutInfrastructure>,
  recipientUserId: string,
): Promise<{ keys: string[]; totalAmountVnd: number; identifier: string }> {
  await syncAllPeriodPayoutRecords(db, payoutInfra);
  const all = await payoutInfra.listAll();
  const unpaid = all.filter((p) => p.recipientUserId === recipientUserId && p.status !== 'paid');
  const totalAmountVnd = unpaid.reduce((s, p) => s + p.totalAmountVnd, 0);
  const identifier = unpaid[0]?.recipientIdentifier ?? recipientUserId;
  return {
    keys: unpaid.map((p) => p.payoutKey),
    totalAmountVnd,
    identifier,
  };
}

export async function processEarningsPayoutCassoIPN(
  c: Context,
  bindingName: string,
  transferCode: string,
  debitedAmount: number,
  externalRef: string,
  kv: KVNamespace,
): Promise<{ success: boolean; code: string; message: string }> {
  const mappingRaw = await kv.get(`casso_ref:${transferCode}`);
  if (!mappingRaw) {
    return { success: false, code: '01', message: 'Payout transfer not found' };
  }

  const mapping = parseEarningsPayoutCassoMapping(mappingRaw);
  if (!mapping) {
    return { success: false, code: '01', message: 'Invalid payout mapping' };
  }

  const absAmount = Math.abs(debitedAmount);
  if (absAmount !== mapping.amountVnd) {
    return { success: false, code: '04', message: 'Payout amount mismatch' };
  }

  const adminStub = getIdFromName(
    c,
    COMMISSION_ADMIN_IDENTIFIER,
    bindingName,
  ) as DurableObjectStub<UserDO>;
  const payoutInfra = createEarningsPayoutInfrastructure(adminStub);
  const note = `Casso ${externalRef}`;
  await payoutInfra.markPaidBatch(mapping.payoutKeys, note);
  await kv.delete(`casso_ref:${transferCode}`);

  return { success: true, code: '00', message: 'Payout recorded' };
}
