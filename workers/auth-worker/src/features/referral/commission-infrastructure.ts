import { UserDO } from '../ws/infrastructure/UserDO';
import { Commission } from './domain';
import { executeUtils } from '../../shared/utils';

export function createCommissionInfrastructure(userDO: DurableObjectStub<UserDO>) {
  return {
    insert: (data: Partial<Commission>) =>
      executeUtils.executeDynamicAction(userDO, 'insert', data, 'commissions'),
  };
}
