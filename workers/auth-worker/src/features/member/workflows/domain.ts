import { z } from 'zod';

/** Node types in the visual workflow editor (n8n-style). */
export const WorkflowNodeTypeSchema = z.enum([
  'agent',
  'trigger',
  'human_review',
  'flow',
  'core',
  'action_in_app',
  'data_transformation',
]);

export const WorkflowDefinitionSchema = z.object({
  nodes: z.array(
    z.object({
      id: z.string(),
      type: WorkflowNodeTypeSchema,
      position: z.object({ x: z.number(), y: z.number() }),
      data: z.record(z.unknown()).default({}),
    }),
  ),
  edges: z.array(
    z.object({
      id: z.string(),
      source: z.string(),
      target: z.string(),
      sourceHandle: z.string().optional(),
      targetHandle: z.string().optional(),
    }),
  ),
  viewport: z
    .object({ x: z.number(), y: z.number(), zoom: z.number() })
    .optional(),
});

export const AgentWorkflowSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  /** Unique per user (slug for URLs). */
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  /** JSON string of WorkflowDefinition */
  definition: z.string().default('{"nodes":[],"edges":[]}'),
  isShared: z.boolean().default(false),
  /** Owner labels workflow type (1–5 stars). */
  starCount: z.number().int().min(0).max(5).default(0),
  starLabel: z.string().max(100).optional(),
  usageCount: z.number().int().min(0).default(0),
  totalEarningsUsd: z.number().min(0).default(0),
  status: z.enum(['draft', 'published']).default('draft'),
});

/** Personal star/label when browsing shared workflows (per consumer). */
export const WorkflowUserStarSchema = z.object({
  /** `${workflowOwnerId}:${workflowId}` — unique per user */
  workflowKey: z.string().min(1).max(200),
  workflowOwnerId: z.string(),
  workflowId: z.number().int(),
  starCount: z.number().int().min(1).max(5),
  label: z.string().max(100).optional(),
});

/** Comment on a shared workflow (stored in commenter's DO, synced to D1). */
export const WorkflowCommentSchema = z.object({
  workflowOwnerId: z.string(),
  workflowId: z.number().int(),
  content: z.string().min(1).max(2000),
  rating: z.number().int().min(1).max(5).optional(),
  authorDisplayName: z.string().max(200).optional(),
});

/** Royalty paid to workflow owner when others use their shared workflow. */
export const WorkflowRoyaltySchema = z.object({
  workflowId: z.number().int(),
  workflowOwnerId: z.string(),
  consumerUserId: z.string(),
  serviceUsageGlobalId: z.number().int().optional(),
  baseCostUsd: z.number().min(0),
  royaltyPercent: z.number().min(0).max(100),
  royaltyAmountUsd: z.number().min(0),
  currency: z.string().default('USD'),
});

export type AgentWorkflow = z.infer<typeof AgentWorkflowSchema>;
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;
export type WorkflowComment = z.infer<typeof WorkflowCommentSchema>;
export type WorkflowRoyalty = z.infer<typeof WorkflowRoyaltySchema>;
