import { tool } from 'ai';
import { z } from 'zod';

import { createServiceApplicationService } from '../../admin/service/application';

export function getServicesTool(c: any, bindingName: string, user: any) {
  return tool({
    description:
      'Lay danh sach dich vu (endpoint, feePercent) cua user da dang nhap.',
    inputSchema: z.object({
      activeOnly: z.boolean().default(true),
    }),
    async *execute(input: { activeOnly?: boolean }) {
      yield { state: 'loading' as const };

      try {
        const request = { activeOnly: input.activeOnly ?? true };
        const serviceApp = createServiceApplicationService(c, bindingName);
        const services = await serviceApp.getUserServices(user.identifier);
        const filteredServices = request.activeOnly
          ? services.filter((service: any) => service.isActive)
          : services;

        const data = filteredServices.map((service: any) => ({
          id: service.id,
          name: service.name,
          endpoint: service.endpoint,
          isActive: service.isActive,
          expiresAt: service.expiresAt,
          feePercent: service.feePercent ?? service.fee_percent ?? 100,
        }));

        yield {
          state: 'ready' as const,
          ok: true,
          body: {
            total: data.length,
            services: data,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to get services';
        yield { state: 'ready' as const, ok: false, error: message };
      }
    },
  });
}
