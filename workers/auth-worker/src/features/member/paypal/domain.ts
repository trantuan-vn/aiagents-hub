import { z } from 'zod';

/** Frontend asks the backend to create a PayPal order for an existing internal order. */
export const CreatePaypalOrderSchema = z.object({
  orderId: z.number().int().positive(),
});

/** Frontend asks the backend to capture a PayPal order it just approved in the popup. */
export const CapturePaypalOrderSchema = z.object({
  orderId: z.number().int().positive(),
  paypalOrderId: z.string().min(1),
});

export type CreatePaypalOrder = z.infer<typeof CreatePaypalOrderSchema>;
export type CapturePaypalOrder = z.infer<typeof CapturePaypalOrderSchema>;

export interface CreatePaypalOrderResult {
  /** PayPal order id used by the JS SDK Buttons createOrder() resolver. */
  paypalOrderId: string;
}

export interface CapturePaypalOrderResult {
  success: boolean;
  /** Internal order id that was completed. */
  orderId: number;
  /** USD amount credited to the wallet. */
  creditedUsd: number;
}

export interface IPaypalService {
  createOrder(identifier: string, request: CreatePaypalOrder): Promise<CreatePaypalOrderResult>;
  captureOrder(identifier: string, request: CapturePaypalOrder): Promise<CapturePaypalOrderResult>;
}
