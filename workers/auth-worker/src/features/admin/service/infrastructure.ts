import { UserDO } from '../../ws/infrastructure/UserDO';
import {
  PendingServiceFromModel,
  Service,
  IServiceInfrastructureService,
} from './domain';
import { executeUtils } from '../../../shared/utils';

function isApprovedService(row: Record<string, unknown>): boolean {
  const status = row.approvalStatus ?? row.approval_status ?? 'approved';
  return status === 'approved';
}

function isServiceActive(row: Record<string, unknown>): boolean {
  const v = row.isActive ?? row.is_active;
  return v === true || v === 1 || v === '1';
}

function findExistingForPendingRequest(
  existingList: Record<string, unknown>[],
  req: PendingServiceFromModel,
): Record<string, unknown> | undefined {
  const byEndpoint = existingList.find((r) => String(r.endpoint ?? '') === req.endpoint);
  if (byEndpoint) return byEndpoint;
  return existingList.find((r) => String(r.model ?? '').trim() === req.model);
}

export function createServiceInfrastructureService(
  userDO: DurableObjectStub<UserDO>,
): IServiceInfrastructureService {
  return {
    async registerService(request: Service): Promise<any> {
      return await executeUtils.executeDynamicAction(userDO, 'insert', request, 'services');
    },

    async getUserServices(): Promise<any[]> {
      const rows = await executeUtils.executeDynamicAction(
        userDO,
        'select',
        {
          where: { field: 'isActive', operator: '=', value: 1 },
          orderBy: { field: 'createdAt', direction: 'DESC' },
        },
        'services',
      );
      const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
      return list.filter((r) => isApprovedService(r as Record<string, unknown>));
    },

    async getAdminServices(): Promise<any[]> {
      return await executeUtils.executeDynamicAction(
        userDO,
        'select',
        { orderBy: { field: 'createdAt', direction: 'DESC' } },
        'services',
      );
    },

    async getApprovedActiveServices(): Promise<any[]> {
      const rows = await executeUtils.executeDynamicAction(
        userDO,
        'select',
        {
          where: { field: 'isActive', operator: '=', value: 1 },
          orderBy: { field: 'createdAt', direction: 'DESC' },
        },
        'services',
      );
      const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
      return list.filter((r) => isApprovedService(r as Record<string, unknown>));
    },

    async bulkRegisterPendingServices(
      requests: PendingServiceFromModel[],
    ): Promise<{ created: number; skipped: number }> {
      const existing = await executeUtils.executeDynamicAction(userDO, 'select', {}, 'services');
      const existingList = Array.isArray(existing) ? existing : existing ? [existing] : [];
      const byEndpoint = new Set(
        existingList.map((r) => String((r as Record<string, unknown>).endpoint ?? '')),
      );
      const byModel = new Set(
        existingList.map((r) => String((r as Record<string, unknown>).model ?? '').trim()).filter(Boolean),
      );

      let created = 0;
      let skipped = 0;
      for (const req of requests) {
        const existing = findExistingForPendingRequest(existingList, req);
        if (existing) {
          if (isServiceActive(existing)) {
            skipped += 1;
            continue;
          }
          const serviceId = Number(existing.id);
          if (!Number.isFinite(serviceId)) {
            skipped += 1;
            continue;
          }
          await executeUtils.executeDynamicAction(
            userDO,
            'update',
            {
              id: serviceId,
              name: req.name,
              endpoint: req.endpoint,
              model: req.model,
              priceInput: req.priceInput,
              priceOutput: req.priceOutput,
              priceInputCache: req.priceInputCache,
              approvalStatus: 'pending',
              isActive: false,
              feePercent: req.feePercent,
            },
            'services',
          );
          created += 1;
          continue;
        }
        if (byEndpoint.has(req.endpoint) || byModel.has(req.model)) {
          skipped += 1;
          continue;
        }
        await executeUtils.executeDynamicAction(userDO, 'insert', req, 'services');
        byEndpoint.add(req.endpoint);
        byModel.add(req.model);
        created += 1;
      }
      return { created, skipped };
    },

    async approveService(serviceId: number): Promise<any> {
      return await executeUtils.executeDynamicAction(
        userDO,
        'update',
        { id: serviceId, approvalStatus: 'approved', isActive: true },
        'services',
      );
    },

    async updateService(serviceId: number, data: Record<string, unknown>): Promise<any> {
      return await executeUtils.executeDynamicAction(
        userDO,
        'update',
        { id: serviceId, ...data },
        'services',
      );
    },

    async cancelService(serviceId: number): Promise<void> {
      await executeUtils.executeDynamicAction(
        userDO,
        'update',
        { id: serviceId, isActive: false },
        'services',
      );
    },

    async getServiceUsage(serviceId: number, days: number = 30): Promise<any[]> {
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      return await executeUtils.executeDynamicAction(
        userDO,
        'select',
        {
          where: [
            { field: 'serviceId', operator: '=', value: serviceId },
            { field: 'createdAt', operator: '>=', value: cutoff },
          ],
          orderBy: { field: 'createdAt', direction: 'DESC' },
        },
        'service_usages',
      );
    },
  };
}
