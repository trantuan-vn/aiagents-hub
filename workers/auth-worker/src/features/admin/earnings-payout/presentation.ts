import { Hono } from 'hono';
import { requireAdmin } from '../../auth/authMiddleware';
import { handleError, getIdFromName } from '../../../shared/utils';
import { UserDO } from '../../ws/infrastructure/UserDO';
import { createPayoutBeneficiaryInfrastructure } from '../../member/payout/beneficiary-infrastructure';
import { generateVietQr } from '../../member/payout/vietqr';
import { randomPayoutTransferCode } from './casso-payout';
import {
  createEarningsPayoutInfrastructure,
} from './infrastructure';
import { GeneratePayoutQrSchema } from './domain';
import {
  attachBeneficiaries,
  buildAggregatedPayoutList,
  COMMISSION_ADMIN_IDENTIFIER,
  getUnpaidPayoutKeysForUser,
  syncAllPeriodPayoutRecords,
} from './service';

export function createAdminEarningsPayoutRoutes(bindingName: string) {
  const app = new Hono<{ Bindings: Env }>();

  app.get('/list', async (c) => {
    try {
      requireAdmin(c);
      const db = c.env.D1DB;
      if (!db) throw new Error('D1 database binding not configured');

      const payoutInfra = createEarningsPayoutInfrastructure(
        getIdFromName(c, COMMISSION_ADMIN_IDENTIFIER, bindingName) as DurableObjectStub<UserDO>,
      );

      const allRecords = await syncAllPeriodPayoutRecords(db, payoutInfra);
      const aggregated = buildAggregatedPayoutList(allRecords);
      const items = await attachBeneficiaries(c, bindingName, aggregated);

      return c.json({ items });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to list earnings payouts');
      return c.json(errorResponse, status);
    }
  });

  app.post('/qr', async (c) => {
    try {
      requireAdmin(c);
      const body = await c.req.json();
      const { recipientUserId } = GeneratePayoutQrSchema.parse(body);
      const db = c.env.D1DB;
      if (!db) throw new Error('D1 database binding not configured');

      const adminStub = getIdFromName(
        c,
        COMMISSION_ADMIN_IDENTIFIER,
        bindingName,
      ) as DurableObjectStub<UserDO>;
      const payoutInfra = createEarningsPayoutInfrastructure(adminStub);

      const { keys, totalAmountVnd, identifier } = await getUnpaidPayoutKeysForUser(
        db,
        payoutInfra,
        recipientUserId,
      );
      if (keys.length === 0 || totalAmountVnd <= 0) {
        throw new Error('No unpaid earnings for this user');
      }

      const binding = c.env[bindingName as keyof Env] as DurableObjectNamespace;
      const userStub = binding.get(binding.idFromString(recipientUserId)) as DurableObjectStub<UserDO>;
      const beneficiary = await createPayoutBeneficiaryInfrastructure(userStub).get();
      if (!beneficiary) {
        throw new Error('User has not configured payout beneficiary account');
      }

      const transferCode = randomPayoutTransferCode();
      const kv = c.env.NONCE_KV;
      if (!kv) throw new Error('KV binding not configured');

      await kv.put(
        `casso_ref:${transferCode}`,
        JSON.stringify({
          type: 'earnings_payout',
          recipientUserId,
          payoutKeys: keys,
          amountVnd: totalAmountVnd,
        }),
        { expirationTtl: 60 * 60 * 24 * 7 },
      );

      const qr = await generateVietQr({
        account: beneficiary,
        amount: totalAmountVnd,
        addInfo: transferCode,
      });

      return c.json({
        qr,
        amount: totalAmountVnd,
        beneficiary,
        addInfo: transferCode,
        recipientUserId,
        recipientIdentifier: identifier,
        payoutKeys: keys,
      });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to generate payout QR');
      return c.json(errorResponse, status);
    }
  });

  return app;
}
