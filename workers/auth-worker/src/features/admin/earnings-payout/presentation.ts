import { Hono } from 'hono';
import { requireAdmin } from '../../auth/authMiddleware';
import { handleError, getIdFromName } from '../../../shared/utils';
import { UserDO } from '../../ws/infrastructure/UserDO';
import { createPayoutBeneficiaryInfrastructure } from '../../member/payout/beneficiary-infrastructure';
import { generateVietQr } from '../../member/payout/vietqr';
import { mergePeriodEarnings } from './d1';
import {
  createEarningsPayoutInfrastructure,
  payoutKey,
} from './infrastructure';
import { GeneratePayoutQrSchema, MarkEarningsPaidSchema } from './domain';

const COMMISSION_ADMIN_IDENTIFIER = 'tuanta2021@gmail.com';

function currentPeriod(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function createAdminEarningsPayoutRoutes(bindingName: string) {
  const app = new Hono<{ Bindings: Env }>();

  app.get('/list', async (c) => {
    try {
      requireAdmin(c);
      const period = c.req.query('period') || currentPeriod();
      const db = c.env.D1DB;
      if (!db) throw new Error('D1 database binding not configured');

      const earnings = await mergePeriodEarnings(db, period);
      const payoutInfra = createEarningsPayoutInfrastructure(
        getIdFromName(c, COMMISSION_ADMIN_IDENTIFIER, bindingName) as DurableObjectStub<UserDO>,
      );
      const paidRecords = await payoutInfra.listByPeriod(period);
      const paidByUser = new Map(paidRecords.map((p) => [p.recipientUserId, p]));

      for (const row of earnings) {
        const key = payoutKey(period, row.recipientUserId);
        const existing = paidByUser.get(row.recipientUserId);
        if (!existing) {
          await payoutInfra.upsertPending({
            payoutKey: key,
            period,
            recipientUserId: row.recipientUserId,
            recipientIdentifier: row.recipientIdentifier,
            commissionAmountVnd: row.commissionAmountVnd,
            workflowRoyaltyAmountVnd: row.workflowRoyaltyAmountVnd,
            totalAmountVnd: row.totalAmountVnd,
            status: 'pending',
          });
        } else if (existing.status !== 'paid') {
          await payoutInfra.upsertPending({
            ...existing,
            commissionAmountVnd: row.commissionAmountVnd,
            workflowRoyaltyAmountVnd: row.workflowRoyaltyAmountVnd,
            totalAmountVnd: row.totalAmountVnd,
            status: 'pending',
          });
        }
      }

      const updatedPaid = await payoutInfra.listByPeriod(period);
      const statusMap = new Map(updatedPaid.map((p) => [p.recipientUserId, p]));

      const binding = c.env[bindingName as keyof Env] as DurableObjectNamespace;
      const items = await Promise.all(
        earnings.map(async (row) => {
          const payout = statusMap.get(row.recipientUserId);
          let beneficiary: {
            accountNo: string;
            accountName: string;
            acqId: string;
            bankName?: string;
          } | null = null;
          try {
            const stub = binding.get(binding.idFromString(row.recipientUserId)) as DurableObjectStub<UserDO>;
            beneficiary = await createPayoutBeneficiaryInfrastructure(stub).get();
          } catch {
            beneficiary = null;
          }
          return {
            ...row,
            status: payout?.status ?? 'pending',
            paidAt: payout?.paidAt,
            paymentNote: payout?.paymentNote,
            hasBeneficiary: !!beneficiary,
            beneficiary,
          };
        }),
      );

      return c.json({ period, items });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to list earnings payouts');
      return c.json(errorResponse, status);
    }
  });

  app.post('/qr', async (c) => {
    try {
      requireAdmin(c);
      const body = await c.req.json();
      const { period, recipientUserId } = GeneratePayoutQrSchema.parse(body);
      const db = c.env.D1DB;
      if (!db) throw new Error('D1 database binding not configured');

      const earnings = await mergePeriodEarnings(db, period);
      const row = earnings.find((e) => e.recipientUserId === recipientUserId);
      if (!row || row.totalAmountVnd <= 0) {
        throw new Error('No earnings for this user in period');
      }

      const binding = c.env[bindingName as keyof Env] as DurableObjectNamespace;
      const userStub = binding.get(binding.idFromString(recipientUserId)) as DurableObjectStub<UserDO>;
      const beneficiary = await createPayoutBeneficiaryInfrastructure(userStub).get();
      if (!beneficiary) {
        throw new Error('User has not configured payout beneficiary account');
      }

      const addInfo = `HH${period.replace('-', '')}`.slice(0, 25);
      const qr = await generateVietQr({
        account: beneficiary,
        amount: row.totalAmountVnd,
        addInfo,
      });

      return c.json({
        qr,
        amount: row.totalAmountVnd,
        beneficiary,
        addInfo,
        period,
        recipientUserId,
        recipientIdentifier: row.recipientIdentifier,
      });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to generate payout QR');
      return c.json(errorResponse, status);
    }
  });

  app.post('/mark-paid', async (c) => {
    try {
      requireAdmin(c);
      const body = await c.req.json();
      const { period, recipientUserId, paymentNote } = MarkEarningsPaidSchema.parse(body);
      const key = payoutKey(period, recipientUserId);
      const payoutInfra = createEarningsPayoutInfrastructure(
        getIdFromName(c, COMMISSION_ADMIN_IDENTIFIER, bindingName) as DurableObjectStub<UserDO>,
      );

      const db = c.env.D1DB;
      if (!db) throw new Error('D1 database binding not configured');
      const earnings = await mergePeriodEarnings(db, period);
      const row = earnings.find((e) => e.recipientUserId === recipientUserId);
      if (!row) throw new Error('No earnings for this user in period');

      let record = await payoutInfra.getByKey(key);
      if (!record) {
        await payoutInfra.upsertPending({
          payoutKey: key,
          period,
          recipientUserId,
          recipientIdentifier: row.recipientIdentifier,
          commissionAmountVnd: row.commissionAmountVnd,
          workflowRoyaltyAmountVnd: row.workflowRoyaltyAmountVnd,
          totalAmountVnd: row.totalAmountVnd,
          status: 'pending',
        });
      }

      const updated = await payoutInfra.markPaid(key, paymentNote);
      return c.json(updated);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to mark payout as paid');
      return c.json(errorResponse, status);
    }
  });

  return app;
}
