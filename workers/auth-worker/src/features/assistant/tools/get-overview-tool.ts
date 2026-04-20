import { tool } from 'ai';
import { z } from 'zod';

import { getIdFromName } from '../../../shared/utils';
import { UserDO } from '../../ws/infrastructure/UserDO';
import { getOverviewData } from '../../member/overview/infrastructure';

export function getOverviewTool(c: any, bindingName: string, user: any) {
  return tool({
    description: 'Lay du lieu tong quan overview cho user dang dang nhap.',
    inputSchema: z.object({}),
    async *execute() {
      yield { state: 'loading' as const };

      try {
        const userDO = getIdFromName(c, user.identifier, bindingName) as DurableObjectStub<UserDO>;
        const overview = await getOverviewData(userDO);
        yield { state: 'ready' as const, ok: true, body: overview };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to get overview data';
        yield { state: 'ready' as const, ok: false, error: message };
      }
    },
  });
}
