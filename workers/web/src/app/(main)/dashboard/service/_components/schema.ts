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

// Service Schema
export const serviceSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  name: z.string().min(1).max(100),
  endpoint: endpointSchema,
  maxCalls: z.number().min(0).default(0),
  currentCalls: z.number().min(0).default(0),
  expiresAt: z
    .preprocess(
      (val) => {
        if (val === null || val === undefined || val === "") return undefined;
        // Xử lý cả string số và number
        const num = Number(val);

        if (!isNaN(num)) {
          const date = new Date();

          // Phân biệt: số nhỏ là ngày, số lớn là timestamp
          if (num < 10000) {
            // Giả sử < 10000 là số ngày
            // Giới hạn tối đa 360 ngày nếu cần
            const daysToAdd = num > 360 ? 360 : num;
            date.setDate(date.getDate() + daysToAdd);
            return date.toISOString();
          } else {
            // Số lớn: coi như timestamp
            return new Date(num).toISOString();
          }
        }

        return val;
      },
      z.string().datetime().optional(),
    )
    .optional(),
  isActive: z.boolean().default(true),
  createdAt: z.string().datetime().optional(),
});

// Create Service Schema (without id and createdAt)
export const createServiceSchema = z.object({
  name: z.string().min(1).max(100),
  endpoint: endpointSchema,
  maxCalls: z.number().min(0),
  currentCalls: z.number().min(0),
  expiresAt: z.string().datetime().optional(),
  isActive: z.boolean(),
});

// Update Service Schema
export const updateServiceSchema = serviceSchema.partial();

// Service Usage Schema
export const serviceUsageSchema = z.object({
  id: z.string().uuid().optional(),
  serviceId: z.string().uuid(),
  endpoint: z.string(),
  userAgent: z.string().optional(),
  ipAddress: z.string().optional(),
  createdAt: z.string().datetime().optional(),
});

// Types
export type Service = z.infer<typeof serviceSchema>;
export type CreateService = z.infer<typeof createServiceSchema>;
export type UpdateService = z.infer<typeof updateServiceSchema>;
export type ServiceUsage = z.infer<typeof serviceUsageSchema>;
