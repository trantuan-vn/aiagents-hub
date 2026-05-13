import { z } from 'zod';

// Schemas
export const ServiceSchema = z.object({
  name: z.string().min(1).max(100),
  endpoint: z.string(),
  expiresAt: z.preprocess(
    (val) => {
      // Xử lý cả string số và number
      const num = Number(val);
      
      if (!isNaN(num)) {
        const date = new Date();
        
        // Phân biệt: số nhỏ là ngày, số lớn là timestamp
        if (num < 10000) { // Giả sử < 10000 là số ngày
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
    z.string().datetime().optional()
  ),
  isActive: z.boolean().default(true),
  /** User charge per call = (feePercent / 100) × AI Gateway log cost. Default 100 = same as gateway cost. */
  feePercent: z.number().min(0).max(100000).default(100),
});

export const ServiceUsageSchema = z.object({
  serviceId: z.number().int(),
  endpoint: z.string(),
  userAgent: z.string().optional(),
  ipAddress: z.string().optional(),
  /** Số tiền trừ ví user cho lần gọi (= feePercent × gateway cost). */
  cost: z.number().min(0).optional(),
  /** true = API call failed (không trừ ví), false/undefined = success */
  isError: z.boolean().optional().default(false),
});

export const ServiceIdSchema = z.string().uuid();

// Types
export type Service = z.infer<typeof ServiceSchema>;
export type ServiceUsage = z.infer<typeof ServiceUsageSchema>;

// Domain Interfaces
export interface IServiceInfrastructureService {
  registerService(request: Service): Promise<any>;
  getUserServices(): Promise<any[]>;
  cancelService(serviceId: number): Promise<void>;
  getServiceUsage(serviceId: number, days?: number): Promise<any[]>;
}