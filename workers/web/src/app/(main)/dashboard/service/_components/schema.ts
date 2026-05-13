import { z } from "zod";

// Endpoint validation: accepts both full URL and relative path
const endpointSchema = z
  .string()
  .min(1)
  .refine(
    (val) => {
      // Accept full URL
      try {
        new URL(val);
        return true;
      } catch {
        // Accept relative path starting with /
        return val.startsWith("/");
      }
    },
    {
      message: "Endpoint must be a valid URL or a relative path starting with /",
    },
  );

const feePercentField = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((val): number => {
    if (val === undefined || val === null) return 100;
    if (typeof val === "string" && val.trim() === "") return 100;
    const n = typeof val === "number" ? val : Number(val);
    if (Number.isNaN(n)) return 100;
    return Math.min(100000, Math.max(0, n));
  });

// Service Schema
export const serviceSchema = z.object({
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
        } else {
          return new Date(num).toISOString();
        }
      }

      return val;
    }, z.string().datetime().optional())
    .optional(),
  isActive: z.boolean().default(true),
  /** User fee = (feePercent / 100) × AI Gateway log cost */
  feePercent: feePercentField,
  createdAt: z.string().datetime().optional(),
});

export const createServiceSchema = z.object({
  name: z.string().min(1).max(100),
  endpoint: endpointSchema,
  expiresAt: z.string().datetime().optional(),
  isActive: z.boolean(),
  feePercent: feePercentField,
});

export const updateServiceSchema = serviceSchema.partial();

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
export type ServiceUsage = z.infer<typeof serviceUsageSchema>;
