import { tool } from 'ai';
import { z } from 'zod';

import { executeUtils, getIdFromName } from '../../../shared/utils';
import { UserDO } from '../../ws/infrastructure/UserDO';
import { generateReferralCode, storeReferralCode } from '../../member/referral/utils';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://aiagents-hub.vn';

export function getReferralLinkTool(c: any, bindingName: string, user: any) {
  return tool({
    description: 'Lay referral link va referral code. Nguoi gioi thieu nhan 150 CR khi user duoc moi mo tai khoan moi thanh cong. Khong nhan tien.',
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
          body: {
            referralLink,
            referralCode,
            rewardCredits: 150,
            reward: '150 CR when the referred user opens a new account. No cash.',
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to get referral link';
        yield { state: 'ready' as const, ok: false, error: message };
      }
    },
  });
}
