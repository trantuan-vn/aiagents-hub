import { UserDO } from '../../ws/infrastructure/UserDO';
import { CommissionPolicy } from './domain';
import { executeUtils } from '../../../shared/utils';

export function createCommissionPolicyInfrastructure(userDO: DurableObjectStub<UserDO>) {
  return {
    create: (request: Partial<CommissionPolicy>) =>
      executeUtils.executeDynamicAction(userDO, 'insert', request, 'commission_policies'),

    update: (policyId: number, request: Partial<CommissionPolicy>) =>
      executeUtils.executeDynamicAction(userDO, 'update', { id: policyId, ...request }, 'commission_policies'),

    getById: (policyId: number) =>
      executeUtils.executeDynamicAction(userDO, 'select', {
        where: { field: 'id', operator: '=', value: policyId }
      }, 'commission_policies').then((rows: any[]) => rows[0]),

    list: (limit: number, offset: number, status?: string) =>
      executeUtils.executeDynamicAction(userDO, 'select', {
        ...(status ? { where: { field: 'status', operator: '=', value: status } } : {}),
        orderBy: { field: 'priority', direction: 'DESC' },
        limit,
        offset
      }, 'commission_policies'),

    delete: (policyId: number) =>
      executeUtils.executeDynamicAction(userDO, 'delete', { id: policyId }, 'commission_policies'),
  };
}
