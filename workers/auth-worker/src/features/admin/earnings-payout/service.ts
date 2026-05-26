import { Context } from 'hono';
import { getIdFromName } from '../../../shared/utils';
import { UserDO } from '../../ws/infrastructure/UserDO';
import { parseEarningsPayoutCassoMapping, toPayoutAmountVnd } from './casso-payout';
import {
  createEarningsPayoutInfrastructure,
  payoutKey,
} from './infrastructure';
import {
  currentPeriod,
  enumeratePeriods,
  getEarliestEarningPeriod,
  isPeriodEligibleForPayout,
  mergePeriodEarnings,
} from './d1';
import { executeUtils } from '../../../shared/utils';
import { createPayoutBeneficiaryInfrastructure } from '../../member/payout/beneficiary-infrastructure';
import { createPayoutEncryptionSecretGetter } from '../../member/payout/crypto';

import { getPrimaryAdminIdentifier } from '../admin-identifier';

export { getPrimaryAdminIdentifier };

export interface PayoutPeriodRow {
  period: string;
  commissionAmountUsd: number;
  workflowRoyaltyAmountUsd: number;
  totalAmountUsd: number;
  bankStatus: 'paid' | 'unpaid';
  paidAt?: string;
}

export interface AggregatedPayoutItem {
  recipientUserId: string;
  recipientIdentifier: string;
  commissionAmountUsd: number;
  workflowRoyaltyAmountUsd: number;
  totalAmountUsd: number;
  bankStatus: 'paid' | 'unpaid';
  hasBeneficiary: boolean;
  /** User preference for bank payout (VietQR when VND) */
  earningsPayoutCurrency: 'VND' | 'USD';
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
          commissionAmountUsd: row.commissionAmountUsd,
          workflowRoyaltyAmountUsd: row.workflowRoyaltyAmountUsd,
          totalAmountUsd: row.totalAmountUsd,
          status: 'pending',
        });
      } else if (existing.status !== 'paid') {
        await payoutInfra.upsertPending({
          ...existing,
          commissionAmountUsd: row.commissionAmountUsd,
          workflowRoyaltyAmountUsd: row.workflowRoyaltyAmountUsd,
          totalAmountUsd: row.totalAmountUsd,
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

function aggregatePayoutRecords(
  allRecords: Map<string, import('./domain').EarningsPayout>,
  includeRecord: (record: import('./domain').EarningsPayout) => boolean,
): AggregatedPayoutItem[] {
  const byUser = new Map<string, AggregatedPayoutItem>();

  for (const record of allRecords.values()) {
    if (!includeRecord(record)) continue;

    let agg = byUser.get(record.recipientUserId);
    if (!agg) {
      agg = {
        recipientUserId: record.recipientUserId,
        recipientIdentifier: record.recipientIdentifier,
        commissionAmountUsd: 0,
        workflowRoyaltyAmountUsd: 0,
        totalAmountUsd: 0,
        bankStatus: 'unpaid',
        hasBeneficiary: false,
        earningsPayoutCurrency: 'VND',
        periods: [],
      };
      byUser.set(record.recipientUserId, agg);
    }

    agg.commissionAmountUsd += record.commissionAmountUsd;
    agg.workflowRoyaltyAmountUsd += record.workflowRoyaltyAmountUsd;
    agg.totalAmountUsd += record.totalAmountUsd;
    agg.periods.push({
      period: record.period,
      commissionAmountUsd: record.commissionAmountUsd,
      workflowRoyaltyAmountUsd: record.workflowRoyaltyAmountUsd,
      totalAmountUsd: record.totalAmountUsd,
      bankStatus: 'unpaid',
      paidAt: record.paidAt,
    });
  }

  const items = [...byUser.values()];
  items.sort((a, b) => b.totalAmountUsd - a.totalAmountUsd);
  for (const item of items) {
    item.periods.sort((a, b) => b.period.localeCompare(a.period));
  }
  return items;
}

/** Closed periods only — eligible for bank payout. */
export function buildAggregatedPayoutList(
  allRecords: Map<string, import('./domain').EarningsPayout>,
): AggregatedPayoutItem[] {
  return aggregatePayoutRecords(
    allRecords,
    (record) =>
      record.status !== 'paid' &&
      isPeriodEligibleForPayout(record.period) &&
      record.totalAmountUsd > 0,
  );
}

/** Current month — view only, not payable until the period closes. */
export function buildAccruingPayoutList(
  allRecords: Map<string, import('./domain').EarningsPayout>,
): AggregatedPayoutItem[] {
  const period = currentPeriod();
  return aggregatePayoutRecords(
    allRecords,
    (record) =>
      record.status !== 'paid' &&
      record.period === period &&
      record.totalAmountUsd > 0,
  );
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
      let earningsPayoutCurrency: 'VND' | 'USD' = 'VND';
      try {
        const stub = binding.get(binding.idFromString(row.recipientUserId)) as DurableObjectStub<UserDO>;
        const beneficiary = await createPayoutBeneficiaryInfrastructure(
          stub,
          createPayoutEncryptionSecretGetter(c.env),
        ).get();
        hasBeneficiary = !!beneficiary;
        const users = await executeUtils.executeDynamicAction(stub, 'select', {}, 'users');
        const u = Array.isArray(users) ? users[0] : users;
        const raw = u?.earningsPayoutCurrency ?? u?.earnings_payout_currency;
        earningsPayoutCurrency = raw === 'USD' ? 'USD' : 'VND';
      } catch {
        hasBeneficiary = false;
      }
      return { ...row, hasBeneficiary, earningsPayoutCurrency };
    }),
  );
}

export async function getUnpaidPayoutKeysForUser(
  db: D1Database,
  payoutInfra: ReturnType<typeof createEarningsPayoutInfrastructure>,
  recipientUserId: string,
): Promise<{ keys: string[]; totalAmountUsd: number; identifier: string }> {
  await syncAllPeriodPayoutRecords(db, payoutInfra);
  const all = await payoutInfra.listAll();
  const unpaid = all.filter(
    (p) =>
      p.recipientUserId === recipientUserId &&
      p.status !== 'paid' &&
      isPeriodEligibleForPayout(p.period),
  );
  const totalAmountUsd = unpaid.reduce((s, p) => s + p.totalAmountUsd, 0);
  const identifier = unpaid[0]?.recipientIdentifier ?? recipientUserId;
  return {
    keys: unpaid.map((p) => p.payoutKey),
    totalAmountUsd,
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

  const absAmountVnd = toPayoutAmountVnd(Math.abs(debitedAmount));
  const expectedVnd = toPayoutAmountVnd(mapping.amountVnd);
  if (absAmountVnd !== expectedVnd) {
    return { success: false, code: '04', message: 'Payout amount mismatch' };
  }

  const adminStub = getIdFromName(
    c,
    getPrimaryAdminIdentifier(c.env),
    bindingName,
  ) as DurableObjectStub<UserDO>;
  const payoutInfra = createEarningsPayoutInfrastructure(adminStub);
  for (const key of mapping.payoutKeys) {
    const record = await payoutInfra.getByKey(key);
    if (!record) {
      return { success: false, code: '01', message: 'Payout record not found' };
    }
    if (!isPeriodEligibleForPayout(record.period)) {
      return {
        success: false,
        code: '05',
        message: `Payout period ${record.period} is not closed yet`,
      };
    }
  }
  const note = `Casso ${externalRef}`;
  await payoutInfra.markPaidBatch(mapping.payoutKeys, note);
  await kv.delete(`casso_ref:${transferCode}`);

  return { success: true, code: '00', message: 'Payout recorded' };
}
