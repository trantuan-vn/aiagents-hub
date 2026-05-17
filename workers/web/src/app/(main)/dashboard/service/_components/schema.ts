import { z } from "zod";

import { isCfModel, isProxyModel, parsePriceFieldValue } from "./model-pricing";

const endpointSchema = z
  .string()
  .min(1)
  .refine(
    (val) => {
      try {
        new URL(val);
        return true;
      } catch {
        return val.startsWith("/");
      }
    },
    {
      message: "Endpoint must be a valid URL or a relative path starting with /",
    },
  );

const optionalPrice = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((val): number | undefined => {
    if (val === undefined || val === null) return undefined;
    if (typeof val === "number") {
      if (Number.isNaN(val) || val < 0) return undefined;
      return val;
    }
    return parsePriceFieldValue(String(val));
  });

function coercePrice(val: unknown): number | undefined {
  if (val === undefined || val === null) return undefined;
  if (typeof val === "number") {
    if (Number.isNaN(val) || val < 0) return undefined;
    return val;
  }
  const trimmed = String(val).trim();
  if (trimmed === "" || trimmed === "." || trimmed.endsWith(".")) return undefined;
  return parsePriceFieldValue(trimmed);
}

function refineModelPricing(
  data: {
    model?: string;
    priceInput?: unknown;
    priceOutput?: unknown;
    priceInputCache?: unknown;
  },
  ctx: z.RefinementCtx,
): void {
  const model = data.model?.trim();
  if (!model) return;

  const priceInput = coercePrice(data.priceInput);
  const priceOutput = coercePrice(data.priceOutput);
  const priceInputCache = coercePrice(data.priceInputCache);

  if (isCfModel(model)) {
    if (priceInput === undefined || priceOutput === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Input and output prices are required for @cf models",
        path: ["priceInput"],
      });
    }
  } else if (isProxyModel(model)) {
    if (priceInput === undefined || priceOutput === undefined || priceInputCache === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Input, input cache, and output prices are required for proxy models",
        path: ["priceInput"],
      });
    }
  }
}

const optionalFeePercent = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((val): number => {
    if (val === undefined || val === null || val === "") return 100;
    const n = typeof val === "number" ? val : parsePriceFieldValue(String(val));
    if (n === undefined || n <= 0) return 100;
    return n;
  });

const modelPricingFields = {
  model: z.string().max(256).optional(),
  priceInput: optionalPrice,
  priceOutput: optionalPrice,
  priceInputCache: optionalPrice,
  feePercent: optionalFeePercent,
};

const serviceObjectSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  name: z.string().min(1).max(100),
  endpoint: endpointSchema,
  expiresAt: z
    .preprocess((val) => {
      if (val === null || val === undefined || val === "") return undefined;
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
    }, z.string().datetime().optional())
    .optional(),
  isActive: z.boolean().default(true),
  ...modelPricingFields,
  createdAt: z.string().datetime().optional(),
});

export const serviceSchema = serviceObjectSchema.superRefine(refineModelPricing);

export const createServiceSchema = z
  .object({
    name: z.string().min(1).max(100),
    endpoint: endpointSchema,
    expiresAt: z.string().datetime().optional(),
    isActive: z.boolean(),
    ...modelPricingFields,
  })
  .superRefine(refineModelPricing);

export const updateServiceSchema = serviceObjectSchema.partial().superRefine(refineModelPricing);

export const serviceUsageSchema = z.object({
  id: z.string().uuid().optional(),
  serviceId: z.string().uuid(),
  endpoint: z.string(),
  userAgent: z.string().optional(),
  ipAddress: z.string().optional(),
  createdAt: z.string().datetime().optional(),
});

export type Service = z.infer<typeof serviceSchema>;
export type CreateService = z.infer<typeof createServiceSchema>;
export type CreateServiceFormInput = z.input<typeof createServiceSchema>;
export type UpdateService = z.infer<typeof updateServiceSchema>;
export type UpdateServiceFormInput = z.input<typeof updateServiceSchema>;

/** Shared react-hook-form field shape for create/edit service dialogs */
export type ServiceFormValues = {
  name?: string;
  endpoint?: string;
  expiresAt?: string;
  isActive?: boolean;
  model?: string;
  priceInput?: number | string | null;
  priceOutput?: number | string | null;
  priceInputCache?: number | string | null;
  feePercent?: number | string | null;
};
export type ServiceUsage = z.infer<typeof serviceUsageSchema>;
