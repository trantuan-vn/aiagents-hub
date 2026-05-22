import { UserDO } from '../../ws/infrastructure/UserDO';
import { executeUtils } from '../../../shared/utils';
import { PayoutBeneficiary, PayoutBeneficiaryUpsertSchema } from './domain';

export function createPayoutBeneficiaryInfrastructure(userDO: DurableObjectStub<UserDO>) {
  return {
    get: async (): Promise<PayoutBeneficiary | null> => {
      const rows = await executeUtils.executeDynamicAction(userDO, 'select', { limit: 1 }, 'payout_beneficiary');
      const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      if (!row?.accountNo) return null;
      return {
        accountNo: String(row.accountNo),
        accountName: String(row.accountName ?? ''),
        acqId: String(row.acqId),
        bankName: row.bankName ? String(row.bankName) : undefined,
      };
    },

    upsert: async (input: PayoutBeneficiary): Promise<PayoutBeneficiary> => {
      const data = PayoutBeneficiaryUpsertSchema.parse(input);
      const rows = await executeUtils.executeDynamicAction(userDO, 'select', { limit: 1 }, 'payout_beneficiary');
      const existing = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      if (existing?.id) {
        await executeUtils.executeDynamicAction(
          userDO,
          'update',
          { id: existing.id, ...data, queueStatus: 'pending' },
          'payout_beneficiary',
        );
      } else {
        await executeUtils.executeDynamicAction(
          userDO,
          'insert',
          { ...data, queueStatus: 'pending' },
          'payout_beneficiary',
        );
      }
      return data;
    },
  };
}
