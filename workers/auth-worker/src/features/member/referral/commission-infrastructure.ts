import { UserDO } from '../../ws/infrastructure/UserDO';
import { Commission } from './domain';
import { executeUtils } from '../../../shared/utils';

type CommissionInsert = Partial<Commission> & {
  queueStatus?: 'pending' | 'flushed' | 'processed';
};

export function createCommissionInfrastructure(userDO: DurableObjectStub<UserDO>) {
  return {
    /** Record commission and credit referrer wallet in one atomic multi-table op. */
    creditToWalletAndRecord: async (data: CommissionInsert) => {
      const userRows = await executeUtils.executeDynamicAction(userDO, 'select', {}, 'users');
      const dbUser = Array.isArray(userRows) ? userRows[0] : userRows;
      if (!dbUser?.id) throw new Error('Referrer user not found');

      const credit = Number(data.commissionAmount ?? 0) || 0;
      const prevBal = Number(dbUser.walletBalance ?? dbUser.wallet_balance ?? 0) || 0;

      const operations: Array<{
        table: string;
        operation: 'insert' | 'update';
        id?: number;
        data: Record<string, unknown>;
      }> = [
        {
          table: 'users',
          operation: 'update',
          id: dbUser.id,
          data: { ...dbUser, walletBalance: prevBal + credit, queueStatus: 'pending' },
        },
        {
          table: 'commissions',
          operation: 'insert',
          data: { ...data, queueStatus: data.queueStatus ?? 'pending' },
        },
      ];

      return executeUtils.executeDynamicAction(userDO, 'multi-table', { operations });
    },
  };
}
