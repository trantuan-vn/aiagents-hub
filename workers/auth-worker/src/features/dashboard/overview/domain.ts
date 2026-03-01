import { z } from 'zod';

export const OverviewStatsSchema = z.object({
  totalApiCalls: z.number(),
  activeSubscriptions: z.number(),
  activeTokens: z.number(),
});

export const OverviewSubscriptionSchema = z.object({
  id: z.number(),
  name: z.string(),
  endpoint: z.string().optional(),
  plan: z.string().optional(),
  calls: z.number(),
  limit: z.number(),
  nextBilling: z.string().optional().nullable(),
});

export const OverviewApiKeySchema = z.object({
  id: z.number(),
  name: z.string(),
  status: z.enum(['active', 'inactive']),
  lastUsed: z.string().optional().nullable(),
  expiresAt: z.string().optional().nullable(),
  createdAt: z.string(),
});

export const OverviewActivitySchema = z.object({
  action: z.string(),
  endpoint: z.string(),
  status: z.enum(['success', 'error', 'info']),
  time: z.string(),
});

export const OverviewResponseSchema = z.object({
  stats: OverviewStatsSchema,
  subscriptions: z.array(OverviewSubscriptionSchema),
  apiKeys: z.array(OverviewApiKeySchema),
  recentActivity: z.array(OverviewActivitySchema),
});

export type OverviewStats = z.infer<typeof OverviewStatsSchema>;
export type OverviewSubscription = z.infer<typeof OverviewSubscriptionSchema>;
export type OverviewApiKey = z.infer<typeof OverviewApiKeySchema>;
export type OverviewActivity = z.infer<typeof OverviewActivitySchema>;
export type OverviewResponse = z.infer<typeof OverviewResponseSchema>;
