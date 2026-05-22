import { UserDO } from '../../ws/infrastructure/UserDO';
import { Commission } from './domain';
import { executeUtils } from '../../../shared/utils';

type CommissionInsert = Partial<Commission> & {
  queueStatus?: 'pending' | 'flushed' | 'processed';
};

export function createCommissionInfrastructure(userDO: DurableObjectStub<UserDO>) {
  return {
    /** Record commission only (no wallet credit — paid via monthly payout). */
    recordCommission: async (data: CommissionInsert) => {
      const userRows = await executeUtils.executeDynamicAction(userDO, 'select', {}, 'users');
      const dbUser = Array.isArray(userRows) ? userRows[0] : userRows;
      if (!dbUser?.id) throw new Error('Referrer user not found');

      return executeUtils.executeDynamicAction(userDO, 'insert', {
        ...data,
        queueStatus: data.queueStatus ?? 'pending',
      }, 'commissions');
    },
  };
}
