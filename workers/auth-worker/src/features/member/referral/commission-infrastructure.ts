import { UserDO } from '../../ws/infrastructure/UserDO';
import { Commission } from './domain';
import { executeUtils } from '../../../shared/utils';

type CommissionInsert = Partial<Commission> & {
  queueStatus?: 'pending' | 'flushed' | 'processed';
};

export function createCommissionInfrastructure(userDO: DurableObjectStub<UserDO>) {
  return {
    insert: (data: CommissionInsert) =>
      executeUtils.executeDynamicAction(userDO, 'insert', data, 'commissions'),
  };
}
