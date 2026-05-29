import { Context } from 'hono';
import { getIdFromName } from '../../../shared/utils';
import { UserDO } from '../../ws/infrastructure/UserDO';
import { createPaypalService } from './infrastructure';
import { getPaypalClientId } from './config';
import {
  CapturePaypalOrderResult,
  CapturePaypalOrderSchema,
  CreatePaypalOrderResult,
  CreatePaypalOrderSchema,
} from './domain';

interface IPaypalApplicationService {
  getPublicConfigUseCase(): Promise<{ clientId: string; enabled: boolean }>;
  createOrderUseCase(identifier: string, request: unknown): Promise<CreatePaypalOrderResult>;
  captureOrderUseCase(identifier: string, request: unknown): Promise<CapturePaypalOrderResult>;
}

export function createPaypalApplicationService(c: Context, bindingName: string): IPaypalApplicationService {
  const getService = (identifier: string) => {
    const userDO = getIdFromName(c, identifier, bindingName) as DurableObjectStub<UserDO>;
    return createPaypalService(userDO, { env: c.env, bindingName });
  };

  return {
    async getPublicConfigUseCase(): Promise<{ clientId: string; enabled: boolean }> {
      const clientId = await getPaypalClientId(c.env);
      return { clientId, enabled: clientId.length > 0 };
    },

    async createOrderUseCase(identifier: string, request: unknown): Promise<CreatePaypalOrderResult> {
      const validated = CreatePaypalOrderSchema.parse(request);
      return getService(identifier).createOrder(identifier, validated);
    },

    async captureOrderUseCase(identifier: string, request: unknown): Promise<CapturePaypalOrderResult> {
      const validated = CapturePaypalOrderSchema.parse(request);
      return getService(identifier).captureOrder(identifier, validated);
    },
  };
}
