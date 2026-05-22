import { UserDO } from '../../ws/infrastructure/UserDO';
import { executeUtils } from '../../../shared/utils';
import { EarningsPayout, EarningsPayoutSchema } from './domain';

export function payoutKey(period: string, recipientUserId: string): string {
  return `${period}|${recipientUserId}`;
}

export function createEarningsPayoutInfrastructure(adminDO: DurableObjectStub<UserDO>) {
  return {
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
      return list.map((r: Record<string, unknown>) => ({
        payoutKey: String(r.payoutKey ?? ''),
        period: String(r.period ?? period),
        recipientUserId: String(r.recipientUserId ?? ''),
        recipientIdentifier: String(r.recipientIdentifier ?? ''),
        commissionAmountVnd: Number(r.commissionAmountVnd ?? 0) || 0,
        workflowRoyaltyAmountVnd: Number(r.workflowRoyaltyAmountVnd ?? 0) || 0,
        totalAmountVnd: Number(r.totalAmountVnd ?? 0) || 0,
        status: (r.status === 'paid' ? 'paid' : 'pending') as 'pending' | 'paid',
        paidAt: r.paidAt ? String(r.paidAt) : undefined,
        paymentNote: r.paymentNote ? String(r.paymentNote) : undefined,
      }));
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
      return {
        payoutKey: String(r.payoutKey),
        period: String(r.period),
        recipientUserId: String(r.recipientUserId),
        recipientIdentifier: String(r.recipientIdentifier),
        commissionAmountVnd: Number(r.commissionAmountVnd ?? 0) || 0,
        workflowRoyaltyAmountVnd: Number(r.workflowRoyaltyAmountVnd ?? 0) || 0,
        totalAmountVnd: Number(r.totalAmountVnd ?? 0) || 0,
        status: r.status === 'paid' ? 'paid' : 'pending',
        paidAt: r.paidAt ? String(r.paidAt) : undefined,
        paymentNote: r.paymentNote ? String(r.paymentNote) : undefined,
      };
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

    markPaid: async (
      key: string,
      paymentNote?: string,
    ): Promise<EarningsPayout> => {
      const rows = await executeUtils.executeDynamicAction(
        adminDO,
        'select',
        { where: { field: 'payoutKey', operator: '=', value: key }, limit: 1 },
        'earnings_payouts',
      );
      const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      if (!row?.id) throw new Error('Payout record not found');
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
      return {
        payoutKey: String(row.payoutKey),
        period: String(row.period),
        recipientUserId: String(row.recipientUserId),
        recipientIdentifier: String(row.recipientIdentifier),
        commissionAmountVnd: Number(row.commissionAmountVnd ?? 0) || 0,
        workflowRoyaltyAmountVnd: Number(row.workflowRoyaltyAmountVnd ?? 0) || 0,
        totalAmountVnd: Number(row.totalAmountVnd ?? 0) || 0,
        status: 'paid',
        paidAt,
        paymentNote: paymentNote ?? (row.paymentNote ? String(row.paymentNote) : undefined),
      };
    },
  };
}
