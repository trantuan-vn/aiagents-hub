import { Context } from 'hono';
import { getIdFromName } from '../../../shared/utils';
import { UserDO } from '../../ws/infrastructure/UserDO';
import { createServiceInfrastructureService } from './infrastructure';
import { searchAiModels } from './model-search';
import { scanCloudflareModelsToPendingServices } from './scan-cloudflare';
import { ServiceUsage, Service, ModelSearchResult, ScanCloudflareModelsResult } from './domain';
import { getServiceModel, getServicePricing, isCfModel, isProxyModel } from './pricing';

function assertServiceReadyForApproval(row: Record<string, unknown>): void {
  const model = getServiceModel(row);
  if (!model) throw new Error('Service model is required before approval');
  const pricing = getServicePricing(row);
  if (!pricing) {
    if (isCfModel(model)) {
      throw new Error('priceInput is required for @cf models before approval (output may be 0)');
    }
    if (isProxyModel(model)) {
      throw new Error('priceInput, priceInputCache, and priceOutput are required for proxy models before approval');
    }
    throw new Error('Model pricing must be configured before approval');
  }
  if (isProxyModel(model) && pricing.priceInputCache === undefined) {
    throw new Error('priceInputCache is required for proxy models before approval');
  }
}

export interface IServiceApplicationService {
  registerService(identifier: string, request: Service): Promise<Service>;
  getUserServices(identifier: string): Promise<Service[]>;
  getAdminServices(identifier: string): Promise<Service[]>;
  getApprovedActiveServices(identifier: string): Promise<Service[]>;
  scanCloudflareModels(identifier: string): Promise<ScanCloudflareModelsResult>;
  approveService(identifier: string, serviceId: number): Promise<any>;
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

    async getAdminServices(identifier: string): Promise<any[]> {
      const serviceInfra = getServiceInfrastructure(identifier);
      return await serviceInfra.getAdminServices();
    },

    async getApprovedActiveServices(identifier: string): Promise<any[]> {
      const serviceInfra = getServiceInfrastructure(identifier);
      return await serviceInfra.getApprovedActiveServices();
    },

    async scanCloudflareModels(identifier: string): Promise<ScanCloudflareModelsResult> {
      const serviceInfra = getServiceInfrastructure(identifier);
      return scanCloudflareModelsToPendingServices(c.env, serviceInfra);
    },

    async approveService(identifier: string, serviceId: number): Promise<any> {
      const serviceInfra = getServiceInfrastructure(identifier);
      const rows = await serviceInfra.getAdminServices();
      const list = Array.isArray(rows) ? rows : [];
      const row = list.find((r) => Number((r as Record<string, unknown>).id) === serviceId) as
        | Record<string, unknown>
        | undefined;
      if (!row) throw new Error('Service not found');
      const status = row.approvalStatus ?? row.approval_status ?? 'approved';
      if (status !== 'pending') throw new Error('Only pending services can be approved');
      assertServiceReadyForApproval(row);
      return await serviceInfra.approveService(serviceId);
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
