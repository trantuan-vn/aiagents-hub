import { Context } from 'hono';
import { getIdFromName } from '../../../shared/utils';
import { UserDO } from '../../ws/infrastructure/UserDO';
import { createServiceInfrastructureService } from './infrastructure';
import { searchAiModels } from './model-search';
import { ServiceUsage, Service, ModelSearchResult } from './domain';

export interface IServiceApplicationService {
  registerService(identifier: string, request: Service): Promise<Service>;
  getUserServices(identifier: string): Promise<Service[]>;
  updateService(identifier: string, serviceId: number, data: Record<string, unknown>): Promise<any>;
  cancelService(identifier: string, serviceId: number): Promise<void>;
  getServiceUsage(identifier: string, serviceId: number, days?: number): Promise<ServiceUsage[]>;
  searchModels(query: string): Promise<ModelSearchResult[]>;
}

export function createServiceApplicationService(
  c: Context,
  bindingName: string,
): IServiceApplicationService {
  const getServiceInfrastructure = (identifier: string) => {
    const userDO = getIdFromName(c, identifier, bindingName) as DurableObjectStub<UserDO>;
    if (!userDO) throw new Error(`Durable Object not found for identifier: ${identifier}`);
    return createServiceInfrastructureService(userDO);
  };

  return {
    async registerService(identifier: string, request: Service): Promise<any> {
      const serviceInfra = getServiceInfrastructure(identifier);
      return await serviceInfra.registerService(request);
    },

    async getUserServices(identifier: string): Promise<any[]> {
      const serviceInfra = getServiceInfrastructure(identifier);
      return await serviceInfra.getUserServices();
    },

    async updateService(
      identifier: string,
      serviceId: number,
      data: Record<string, unknown>,
    ): Promise<any> {
      const serviceInfra = getServiceInfrastructure(identifier);
      return await serviceInfra.updateService(serviceId, data);
    },

    async cancelService(identifier: string, serviceId: number): Promise<void> {
      const serviceInfra = getServiceInfrastructure(identifier);
      await serviceInfra.cancelService(serviceId);
    },

    async getServiceUsage(
      identifier: string,
      serviceId: number,
      days?: number,
    ): Promise<ServiceUsage[]> {
      const serviceInfra = getServiceInfrastructure(identifier);
      return await serviceInfra.getServiceUsage(serviceId, days);
    },

    async searchModels(query: string): Promise<ModelSearchResult[]> {
      return searchAiModels(c.env, query);
    },
  };
}
