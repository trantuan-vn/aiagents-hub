import { z } from 'zod';

import { isCfModel, isProxyModel } from './pricing';

const priceField = z.number().min(0).optional();

function applyModelPricingRefine<T extends { model?: string; priceInput?: number; priceOutput?: number; priceInputCache?: number }>(
  data: T,
  ctx: z.RefinementCtx,
): void {
  const model = data.model?.trim();
  if (!model) return;
  if (isCfModel(model)) {
    if (data.priceInput === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'priceInput is required for @cf models (priceOutput may be 0 if unused)',
      });
    }
  } else if (isProxyModel(model)) {
    if (
      data.priceInput === undefined ||
      data.priceOutput === undefined ||
      data.priceInputCache === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'priceInput, priceInputCache, and priceOutput are required for proxy models',
      });
    }
  }
}

/** Base Zod object for DB table registration (must support `.extend()`). */
export const ServiceObjectSchema = z.object({
  name: z.string().min(1).max(100),
  endpoint: z.string(),
  expiresAt: z.preprocess(
    (val) => {
      const num = Number(val);

      if (!isNaN(num)) {
        const date = new Date();

        if (num < 10000) {
          const daysToAdd = num > 360 ? 360 : num;
          date.setDate(date.getDate() + daysToAdd);
          return date.toISOString();
        }
        return new Date(num).toISOString();
      }

      return val;
    },
    z.string().datetime().optional(),
  ),
  isActive: z.boolean().default(true),
  /** pending = chờ admin duyệt; approved = có thể dùng trong workflow */
  approvalStatus: z.enum(['pending', 'approved']).default('approved'),
  model: z.preprocess(
    (val) => (typeof val === 'string' && !val.trim() ? undefined : val),
    z.string().max(256).optional(),
  ),
  priceInput: priceField,
  priceOutput: priceField,
  priceInputCache: priceField,
  /** eKYC: user charge = token cost × (feePercent / 100). Default 100 = at cost. */
  feePercent: z.number().min(0.01).max(1_000_000).default(100),
});

export const ServiceSchema = ServiceObjectSchema.superRefine(applyModelPricingRefine);

/** Members may only change model and per-token prices */
export const ServicePricingUpdateSchema = z
  .object({
    model: z.preprocess(
      (val) => (typeof val === 'string' && !val.trim() ? undefined : val),
      z.string().max(256).optional(),
    ),
    priceInput: priceField,
    priceOutput: priceField,
    priceInputCache: priceField,
    feePercent: z.number().min(0.01).max(1_000_000).optional(),
  })
  .superRefine(applyModelPricingRefine);

export const ServiceUpdateSchema = ServiceObjectSchema.partial().superRefine(applyModelPricingRefine);

export const ServiceUsageSchema = z.object({
  serviceId: z.number().int(),
  endpoint: z.string(),
  userAgent: z.string().optional(),
  ipAddress: z.string().optional(),
  cost: z.number().min(0).optional(),
  isError: z.boolean().optional().default(false),
  /** Shared agent workflow attribution */
  workflowId: z.number().int().optional(),
  workflowOwnerId: z.string().optional(),
  workflowRoyaltyVnd: z.number().min(0).optional(),
});

export const ServiceIdSchema = z.string().uuid();

export type Service = z.infer<typeof ServiceSchema>;
export type ServicePricingUpdate = z.infer<typeof ServicePricingUpdateSchema>;
export type ServiceUsage = z.infer<typeof ServiceUsageSchema>;

export const PendingServiceFromModelSchema = z.object({
  name: z.string().min(1).max(100),
  endpoint: z.string().min(1),
  model: z.string().max(256),
  priceInput: priceField,
  priceOutput: priceField,
  priceInputCache: priceField,
  approvalStatus: z.literal('pending'),
  isActive: z.literal(false),
  feePercent: z.number().min(0.01).max(1_000_000).default(100),
});

export type PendingServiceFromModel = z.infer<typeof PendingServiceFromModelSchema>;

export interface ScanCloudflareModelsResult {
  created: number;
  skipped: number;
  totalModels: number;
}

export interface IServiceInfrastructureService {
  registerService(request: Service): Promise<any>;
  getUserServices(): Promise<any[]>;
  getAdminServices(): Promise<any[]>;
  getApprovedActiveServices(): Promise<any[]>;
  bulkRegisterPendingServices(requests: PendingServiceFromModel[]): Promise<{ created: number; skipped: number }>;
  approveService(serviceId: number): Promise<any>;
  updateService(serviceId: number, data: Record<string, unknown>): Promise<any>;
  cancelService(serviceId: number): Promise<void>;
  getServiceUsage(serviceId: number, days?: number): Promise<any[]>;
}

export type ModelSearchResult = {
  id: string;
  name?: string;
  description?: string;
  source?: string;
  /** USD per 1M tokens (from CF properties property_id=price) */
  priceInput?: number;
  priceOutput?: number;
  priceInputCache?: number;
};
