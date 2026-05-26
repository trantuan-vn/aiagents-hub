import { Hono } from 'hono';
import { requireAuth } from '../../auth/authMiddleware';
import { handleError, getIdFromName } from '../../../shared/utils';
import { UserDO } from '../../ws/infrastructure/UserDO';
import { PayoutBeneficiaryUpsertSchema } from './domain';
import { createPayoutBeneficiaryInfrastructure } from './beneficiary-infrastructure';
import { createPayoutEncryptionSecretGetter } from './crypto';

export function createPayoutBeneficiaryRoutes(bindingName: string) {
  const app = new Hono<{ Bindings: Env }>();

  app.get('/beneficiary', async (c) => {
    try {
      const user = requireAuth(c);
      const userDO = getIdFromName(c, user.identifier, bindingName) as DurableObjectStub<UserDO>;
      const beneficiary = await createPayoutBeneficiaryInfrastructure(
        userDO,
        createPayoutEncryptionSecretGetter(c.env),
      ).get();
      return c.json({ beneficiary });
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

  return app;
}
