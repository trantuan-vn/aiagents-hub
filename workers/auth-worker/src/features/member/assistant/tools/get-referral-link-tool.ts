import { tool } from 'ai';
import { z } from 'zod';

import { executeUtils, getIdFromName } from '../../../../shared/utils';
import { UserDO } from '../../../ws/infrastructure/UserDO';
import { generateReferralCode, storeReferralCode } from '../../referral/utils';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://unitoken.trade';

export function getReferralLinkTool(c: any, bindingName: string, user: any) {
  return tool({
    description: 'Lay referral link va referral code cua user dang dang nhap.',
    inputSchema: z.object({}),
    async *execute() {
      yield { state: 'loading' as const };

      try {
        const userDO = getIdFromName(c, user.identifier, bindingName) as DurableObjectStub<UserDO>;
        const users = await executeUtils.executeDynamicAction(userDO, 'select', {
          where: { field: 'identifier', operator: '=', value: user.identifier },
        }, 'users');
        const currentUser = Array.isArray(users) ? users[0] : users;
        let referralCode = currentUser?.referralCode as string | undefined;

        if (!referralCode && currentUser) {
          referralCode = generateReferralCode();
          await executeUtils.executeDynamicAction(userDO, 'update', {
            id: currentUser.id,
            referralCode,
          }, 'users');
          if (c.env.NONCE_KV) {
            await storeReferralCode(c.env.NONCE_KV, referralCode, user.identifier);
          }
        }

        if (!referralCode) {
          throw new Error('Failed to get or generate referral code');
        }

        const baseUrl = c.env.FRONTEND_URL || FRONTEND_URL;
        const referralLink = `${baseUrl}/auth/v3/login?ref=${encodeURIComponent(referralCode)}`;
        yield {
          state: 'ready' as const,
          ok: true,
          body: { referralLink, referralCode },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to get referral link';
        yield { state: 'ready' as const, ok: false, error: message };
      }
    },
  });
}
