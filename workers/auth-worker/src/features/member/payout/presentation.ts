import { Hono } from 'hono';
import { requireAuth } from '../../auth/authMiddleware';
import { handleError, getIdFromName } from '../../../shared/utils';
import { UserDO } from '../../ws/infrastructure/UserDO';
import {
  PayoutBeneficiaryUpsertSchema,
  PaypalPayoutBeneficiaryUpsertSchema,
} from './domain';
import {
  createPayoutBeneficiaryInfrastructure,
  maskPaypalEmail,
} from './beneficiary-infrastructure';
import { createPayoutEncryptionSecretGetter } from './crypto';

export function createPayoutBeneficiaryRoutes(bindingName: string) {
  const app = new Hono<{ Bindings: Env }>();

  app.get('/beneficiary', async (c) => {
    try {
      const user = requireAuth(c);
      const userDO = getIdFromName(c, user.identifier, bindingName) as DurableObjectStub<UserDO>;
      const infra = createPayoutBeneficiaryInfrastructure(
        userDO,
        createPayoutEncryptionSecretGetter(c.env),
      );
      const [beneficiary, paypal] = await Promise.all([infra.get(), infra.getPaypal()]);
      return c.json({
        beneficiary,
        paypal: paypal
          ? { paypalEmail: paypal.paypalEmail, maskedEmail: maskPaypalEmail(paypal.paypalEmail) }
          : null,
      });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to get payout beneficiary');
      return c.json(errorResponse, status);
    }
  });

  app.put('/beneficiary', async (c) => {
    try {
      const user = requireAuth(c);
      const body = await c.req.json();
      const data = PayoutBeneficiaryUpsertSchema.parse(body);
      const userDO = getIdFromName(c, user.identifier, bindingName) as DurableObjectStub<UserDO>;
      const beneficiary = await createPayoutBeneficiaryInfrastructure(
        userDO,
        createPayoutEncryptionSecretGetter(c.env),
      ).upsert(data);
      return c.json({ beneficiary });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to save payout beneficiary');
      return c.json(errorResponse, status);
    }
  });

  app.put('/beneficiary/paypal', async (c) => {
    try {
      const user = requireAuth(c);
      const body = await c.req.json();
      const data = PaypalPayoutBeneficiaryUpsertSchema.parse(body);
      const userDO = getIdFromName(c, user.identifier, bindingName) as DurableObjectStub<UserDO>;
      const infra = createPayoutBeneficiaryInfrastructure(
        userDO,
        createPayoutEncryptionSecretGetter(c.env),
      );
      const paypal = await infra.upsertPaypal(data);
      return c.json({
        paypal: {
          paypalEmail: paypal.paypalEmail,
          maskedEmail: maskPaypalEmail(paypal.paypalEmail),
        },
      });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to save PayPal payout beneficiary');
      return c.json(errorResponse, status);
    }
  });

  return app;
}
