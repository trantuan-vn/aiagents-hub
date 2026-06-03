import { Hono } from 'hono';
import { requireAdmin } from '../../auth/authMiddleware';
import { handleError, getIdFromName, executeUtils } from '../../../shared/utils';
import { UserDO } from '../../ws/infrastructure/UserDO';
import { convertUsdToVnd } from '../../admin/service/pricing';
import { getUsdTransferRate, todayDateString } from '../exchange-rate/get-rate';
import { createPayoutBeneficiaryInfrastructure } from '../../member/payout/beneficiary-infrastructure';
import { createPayoutEncryptionSecretGetter } from '../../member/payout/crypto';
import { generateVietQr } from '../../member/payout/vietqr';
import { randomPayoutTransferCode, toPayoutAmountVnd } from './casso-payout';
import {
  createEarningsPayoutInfrastructure,
} from './infrastructure';
import { GeneratePayoutQrSchema, SendPaypalPayoutSchema } from './domain';
import { sendPaypalPayout } from './paypal-payout';
import { currentPeriod } from './d1';
import {
  attachBeneficiaries,
  buildAccruingPayoutList,
  buildAggregatedPayoutList,
  getPrimaryAdminIdentifier,
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
        getIdFromName(c, getPrimaryAdminIdentifier(c.env), bindingName) as DurableObjectStub<UserDO>,
      );

      const allRecords = await syncAllPeriodPayoutRecords(db, payoutInfra);
      const aggregated = buildAggregatedPayoutList(allRecords);
      const accruing = buildAccruingPayoutList(allRecords);
      const [items, accruingItems] = await Promise.all([
        attachBeneficiaries(c, bindingName, aggregated),
        attachBeneficiaries(c, bindingName, accruing),
      ]);

      return c.json({ items, accruingItems, accruingPeriod: currentPeriod() });
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
        getPrimaryAdminIdentifier(c.env),
        bindingName,
      ) as DurableObjectStub<UserDO>;
      const payoutInfra = createEarningsPayoutInfrastructure(adminStub);

      const { keys, totalAmountUsd, identifier } = await getUnpaidPayoutKeysForUser(
        db,
        payoutInfra,
        recipientUserId,
      );
      if (keys.length === 0 || totalAmountUsd <= 0) {
        throw new Error(
          'No unpaid earnings for closed periods for this user (current month cannot be paid yet)',
        );
      }

      const binding = c.env[bindingName as keyof Env] as DurableObjectNamespace;
      const userStub = binding.get(binding.idFromString(recipientUserId)) as DurableObjectStub<UserDO>;
      const users = await executeUtils.executeDynamicAction(userStub, 'select', {}, 'users');
      const u = Array.isArray(users) ? users[0] : users;
      const payoutCurrency =
        (u?.earningsPayoutCurrency ?? u?.earnings_payout_currency) === 'USD' ? 'USD' : 'VND';
      if (payoutCurrency !== 'VND') {
        throw new Error('VietQR payout requires user earnings payout currency to be VND');
      }

      const beneficiary = await createPayoutBeneficiaryInfrastructure(
        userStub,
        createPayoutEncryptionSecretGetter(c.env),
      ).get();
      if (!beneficiary) {
        throw new Error('User has not configured payout beneficiary account');
      }

      // admin trả USD cho user → dùng tỷ giá mua chuyển khoản (transfer)
      const usdVndRate = await getUsdTransferRate(c.env, todayDateString());
      const totalAmountVnd = toPayoutAmountVnd(convertUsdToVnd(totalAmountUsd, usdVndRate));

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
        amountUsd: totalAmountUsd,
        amountVnd: totalAmountVnd,
        usdVndRate,
        beneficiary,
        addInfo: transferCode,
        recipientUserId,
        recipientIdentifier: identifier,
        payoutKeys: keys,
        earningsPayoutCurrency: payoutCurrency,
      });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to generate payout QR');
      return c.json(errorResponse, status);
    }
  });

  app.post('/paypal', async (c) => {
    try {
      requireAdmin(c);
      const body = await c.req.json();
      const { recipientUserId } = SendPaypalPayoutSchema.parse(body);
      const db = c.env.D1DB;
      if (!db) throw new Error('D1 database binding not configured');

      const adminStub = getIdFromName(
        c,
        getPrimaryAdminIdentifier(c.env),
        bindingName,
      ) as DurableObjectStub<UserDO>;
      const payoutInfra = createEarningsPayoutInfrastructure(adminStub);

      const { keys, totalAmountUsd, identifier } = await getUnpaidPayoutKeysForUser(
        db,
        payoutInfra,
        recipientUserId,
      );
      if (keys.length === 0 || totalAmountUsd <= 0) {
        throw new Error(
          'No unpaid earnings for closed periods for this user (current month cannot be paid yet)',
        );
      }

      const binding = c.env[bindingName as keyof Env] as DurableObjectNamespace;
      const userStub = binding.get(binding.idFromString(recipientUserId)) as DurableObjectStub<UserDO>;
      const users = await executeUtils.executeDynamicAction(userStub, 'select', {}, 'users');
      const u = Array.isArray(users) ? users[0] : users;
      const payoutCurrency =
        (u?.earningsPayoutCurrency ?? u?.earnings_payout_currency) === 'USD' ? 'USD' : 'VND';
      if (payoutCurrency !== 'USD') {
        throw new Error('PayPal payout requires user earnings payout currency to be USD');
      }

      const paypalBeneficiary = await createPayoutBeneficiaryInfrastructure(
        userStub,
        createPayoutEncryptionSecretGetter(c.env),
      ).getPaypal();
      if (!paypalBeneficiary) {
        throw new Error('User has not configured PayPal payout email');
      }

      const batchId = `ep_${recipientUserId}_${keys.sort().join('_')}`.slice(0, 127);
      const payoutResult = await sendPaypalPayout(c.env, {
        recipientEmail: paypalBeneficiary.paypalEmail,
        amountUsd: totalAmountUsd,
        batchId,
        note: `Earnings payout ${identifier}`,
      });

      const note = `PayPal ${payoutResult.payoutBatchId}`;
      await payoutInfra.markPaidBatch(keys, note);

      return c.json({
        success: true,
        amountUsd: totalAmountUsd,
        paypalEmail: paypalBeneficiary.paypalEmail,
        payoutBatchId: payoutResult.payoutBatchId,
        batchStatus: payoutResult.batchStatus,
        recipientUserId,
        recipientIdentifier: identifier,
        payoutKeys: keys,
        earningsPayoutCurrency: payoutCurrency,
      });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to send PayPal payout');
      return c.json(errorResponse, status);
    }
  });

  return app;
}
