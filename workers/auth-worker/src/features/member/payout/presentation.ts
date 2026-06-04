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
import { paypalQrKeyToDataUrl, savePaypalQrToR2 } from './r2';

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
      const [beneficiary, paypal, hasPaypalQr] = await Promise.all([
        infra.get(),
        infra.getPaypal(),
        infra.getPaypalQrImageKey().then((k) => !!k),
      ]);
      return c.json({
        beneficiary,
        paypal: paypal
          ? {
              paypalEmail: paypal.paypalEmail,
              maskedEmail: maskPaypalEmail(paypal.paypalEmail),
              hasPaypalQr,
            }
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

  app.get('/beneficiary/paypal/qr', async (c) => {
    try {
      const user = requireAuth(c);
      const userDO = getIdFromName(c, user.identifier, bindingName) as DurableObjectStub<UserDO>;
      const infra = createPayoutBeneficiaryInfrastructure(
        userDO,
        createPayoutEncryptionSecretGetter(c.env),
      );
      const key = await infra.getPaypalQrImageKey();
      if (!key) return c.json({ qr: null });
      const qr = await paypalQrKeyToDataUrl(c.env, key);
      return c.json({ qr });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to load PayPal QR image');
      return c.json(errorResponse, status);
    }
  });

  app.put('/beneficiary/paypal', async (c) => {
    try {
      const user = requireAuth(c);
      const userDO = getIdFromName(c, user.identifier, bindingName) as DurableObjectStub<UserDO>;
      const infra = createPayoutBeneficiaryInfrastructure(
        userDO,
        createPayoutEncryptionSecretGetter(c.env),
      );

      const contentType = c.req.header('content-type') ?? '';
      let data: { paypalEmail: string };
      let qrImageKey: string | undefined;

      if (contentType.includes('multipart/form-data')) {
        const formData = await c.req.formData();
        const email = String(formData.get('paypalEmail') ?? '').trim();
        data = PaypalPayoutBeneficiaryUpsertSchema.parse({ paypalEmail: email });
        const image = formData.get('paypalQrImage');
        if (image instanceof File && image.size > 0) {
          qrImageKey = await savePaypalQrToR2(c.env, user.identifier, image);
        }
      } else {
        const body = await c.req.json();
        data = PaypalPayoutBeneficiaryUpsertSchema.parse(body);
      }

      const paypal = await infra.upsertPaypal(
        data,
        qrImageKey !== undefined ? qrImageKey : undefined,
      );
      const hasPaypalQr = !!(qrImageKey ?? (await infra.getPaypalQrImageKey()));
      return c.json({
        paypal: {
          paypalEmail: paypal.paypalEmail,
          maskedEmail: maskPaypalEmail(paypal.paypalEmail),
          hasPaypalQr,
        },
      });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to save PayPal payout beneficiary');
      return c.json(errorResponse, status);
    }
  });

  return app;
}
