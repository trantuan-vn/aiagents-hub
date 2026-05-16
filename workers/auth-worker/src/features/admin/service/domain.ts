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
    if (data.priceInput === undefined || data.priceOutput === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'priceInput and priceOutput are required for @cf models',
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
});

export const ServiceIdSchema = z.string().uuid();

export type Service = z.infer<typeof ServiceSchema>;
export type ServicePricingUpdate = z.infer<typeof ServicePricingUpdateSchema>;
export type ServiceUsage = z.infer<typeof ServiceUsageSchema>;

export interface IServiceInfrastructureService {
  registerService(request: Service): Promise<any>;
  getUserServices(): Promise<any[]>;
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
