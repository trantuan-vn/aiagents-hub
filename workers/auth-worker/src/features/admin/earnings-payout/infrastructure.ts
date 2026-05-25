import { UserDO } from '../../ws/infrastructure/UserDO';
import { executeUtils } from '../../../shared/utils';
import { assertPeriodEligibleForPayout } from './d1';
import { EarningsPayout, EarningsPayoutSchema } from './domain';

export function payoutKey(period: string, recipientUserId: string): string {
  return `${period}|${recipientUserId}`;
}

function readUsdField(row: Record<string, unknown>, usdKey: string, vndKey: string): number {
  const usd = row[usdKey] ?? row[usdKey.replace(/([A-Z])/g, '_$1').toLowerCase()];
  if (usd != null && usd !== '') return Number(usd) || 0;
  const legacy = row[vndKey];
  return legacy != null ? Number(legacy) || 0 : 0;
}

function mapPayoutRow(r: Record<string, unknown>): EarningsPayout {
  return {
    payoutKey: String(r.payoutKey ?? ''),
    period: String(r.period ?? ''),
    recipientUserId: String(r.recipientUserId ?? ''),
    recipientIdentifier: String(r.recipientIdentifier ?? ''),
    commissionAmountUsd: readUsdField(r, 'commissionAmountUsd', 'commissionAmountVnd'),
    workflowRoyaltyAmountUsd: readUsdField(r, 'workflowRoyaltyAmountUsd', 'workflowRoyaltyAmountVnd'),
    totalAmountUsd: readUsdField(r, 'totalAmountUsd', 'totalAmountVnd'),
    status: (r.status === 'paid' ? 'paid' : 'pending') as 'pending' | 'paid',
    paidAt: r.paidAt ? String(r.paidAt) : undefined,
    paymentNote: r.paymentNote ? String(r.paymentNote) : undefined,
  };
}

export function createEarningsPayoutInfrastructure(adminDO: DurableObjectStub<UserDO>) {
  const markPaidImpl = async (key: string, paymentNote?: string): Promise<EarningsPayout> => {
    const rows = await executeUtils.executeDynamicAction(
      adminDO,
      'select',
      { where: { field: 'payoutKey', operator: '=', value: key }, limit: 1 },
      'earnings_payouts',
    );
    const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (!row?.id) throw new Error('Payout record not found');
    assertPeriodEligibleForPayout(String(row.period ?? ''));
    const paidAt = new Date().toISOString();
    await executeUtils.executeDynamicAction(
      adminDO,
      'update',
      {
        id: row.id,
        status: 'paid',
        paidAt,
        paymentNote: paymentNote ?? row.paymentNote,
        queueStatus: 'pending',
      },
      'earnings_payouts',
    );
    return { ...mapPayoutRow(row as Record<string, unknown>), status: 'paid' as const, paidAt, paymentNote: paymentNote ?? (row.paymentNote ? String(row.paymentNote) : undefined) };
  };

  return {
    listAll: async (): Promise<EarningsPayout[]> => {
      const rows = await executeUtils.executeDynamicAction(
        adminDO,
        'select',
        { limit: 2000 },
        'earnings_payouts',
      );
      const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
      return list.map((r: Record<string, unknown>) => mapPayoutRow(r));
    },

    listByPeriod: async (period: string): Promise<EarningsPayout[]> => {
      const rows = await executeUtils.executeDynamicAction(
        adminDO,
        'select',
        {
          where: { field: 'period', operator: '=', value: period },
          limit: 500,
        },
        'earnings_payouts',
      );
      const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
      return list.map((r: Record<string, unknown>) => mapPayoutRow({ ...r, period: r.period ?? period }));
    },

    getByKey: async (key: string): Promise<EarningsPayout | null> => {
      const rows = await executeUtils.executeDynamicAction(
        adminDO,
        'select',
        { where: { field: 'payoutKey', operator: '=', value: key }, limit: 1 },
        'earnings_payouts',
      );
      const r = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      if (!r) return null;
      return mapPayoutRow(r as Record<string, unknown>);
    },

    upsertPending: async (data: EarningsPayout): Promise<void> => {
      const parsed = EarningsPayoutSchema.parse(data);
      const existing = await executeUtils.executeDynamicAction(
        adminDO,
        'select',
        { where: { field: 'payoutKey', operator: '=', value: parsed.payoutKey }, limit: 1 },
        'earnings_payouts',
      );
      const row = Array.isArray(existing) && existing.length > 0 ? existing[0] : null;
      if (row?.id) {
        if (row.status === 'paid') return;
        await executeUtils.executeDynamicAction(
          adminDO,
          'update',
          {
            id: row.id,
            ...parsed,
            status: row.status ?? 'pending',
            queueStatus: 'pending',
          },
          'earnings_payouts',
        );
      } else {
        await executeUtils.executeDynamicAction(
          adminDO,
          'insert',
          { ...parsed, queueStatus: 'pending' },
          'earnings_payouts',
        );
      }
    },

    markPaid: markPaidImpl,

    markPaidBatch: async (
      keys: string[],
      paymentNote?: string,
    ): Promise<EarningsPayout[]> => {
      const results: EarningsPayout[] = [];
      for (const key of keys) {
        try {
          results.push(await markPaidImpl(key, paymentNote));
        } catch {
          // skip missing keys
        }
      }
      return results;
    },
  };
}
