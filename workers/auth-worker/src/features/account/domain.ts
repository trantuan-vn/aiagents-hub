import { z } from 'zod';

export const RevokeSessionSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
});

export type RevokeSessionRequest = z.infer<typeof RevokeSessionSchema>;

export interface SessionListItem {
  id: number;
  hashSessionId: string;
  type: string;
  ipAddress?: string;
  userAgent?: string;
  expiresAt: string;
  isActive: boolean;
  isCurrent?: boolean;
}
