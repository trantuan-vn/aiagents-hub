import { z } from 'zod';

export * from './schemas'

// Schema for WebSocket message validation
export const WebSocketMessageSchema = z.object({
  type: z.enum(['ping', 'subscribe', 'unsubscribe', 'workflow_collab']),
  channel: z.string().optional(),
  data: z.any().optional(),
  workflowId: z.number().int().optional(),
  definition: z.string().optional(),
  editorId: z.string().max(80).optional(),
  editorName: z.string().max(120).optional(),
});

export * from '../auth/domain';
export * from '../admin/membership-tier/domain';
export * from '../admin/service/domain';
export * from '../admin/voucher/domain';
export * from '../admin/version/domain';
export * from '../member/ekyc/domain';
export * from '../member/order/domain';
export * from '../member/token/domain';
export * from '../member/vnpay/domain';
export * from '../account/domain';
export * from '../member/referral/domain';
export * from '../member/workflows/domain/domain';
export * from '../member/payout/domain';
export * from '../admin/earnings-payout/domain';

