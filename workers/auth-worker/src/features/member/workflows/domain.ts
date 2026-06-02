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
  'http_request',
  'code',
  'service_node',
  'memory_node',
  'tool_node',
  'sticky_note',
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
  /** JSON string array of tag labels, e.g. `["sales","onboarding"]`. */
  tags: z.string().max(2000).default('[]'),
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

/** Status of a single durable workflow execution. */
export const WorkflowExecutionStatusSchema = z.enum([
  'running',
  'completed',
  'failed',
  'pending_human',
  'cancelled',
]);

/**
 * Durable record of one workflow run. `state` holds the serialized engine
 * snapshot (node outputs, cursor, steps, definition) so a paused or failed run
 * can be resumed / replayed without recomputing prior nodes.
 */
export const WorkflowExecutionSchema = z.object({
  /** Stable public id (uuid) used to fetch/resume the run. Unique per user. */
  executionKey: z.string().min(1).max(80),
  workflowId: z.number().int(),
  workflowOwnerId: z.string(),
  workflowName: z.string().max(200).optional(),
  status: WorkflowExecutionStatusSchema.default('running'),
  /** Triggering input text. */
  input: z.string().optional(),
  /** JSON string of the final (or latest) output. */
  output: z.string().optional(),
  error: z.string().max(2000).optional(),
  totalCostVnd: z.number().min(0).default(0),
  stepCount: z.number().int().min(0).default(0),
  /** JSON string of the serialized engine state for durable resume/replay. */
  state: z.string().default('{}'),
  /** Node currently awaiting a human decision (when status = pending_human). */
  pendingNodeId: z.string().optional(),
  startedAt: z.number().default(Date.now),
  finishedAt: z.number().optional(),
});

/**
 * Immutable snapshot of a workflow definition, captured on publish or manual
 * save-point. Enables version history + restore in the marketplace.
 */
export const WorkflowVersionSchema = z.object({
  /** Stable public id (uuid), unique per user. */
  versionKey: z.string().min(1).max(80),
  workflowId: z.number().int(),
  /** Monotonic version number per workflow (1, 2, 3, …). */
  version: z.number().int().min(1),
  label: z.string().max(120).optional(),
  note: z.string().max(1000).optional(),
  /** JSON string snapshot of the WorkflowDefinition at this version. */
  definition: z.string().default('{"nodes":[],"edges":[]}'),
  /** 'manual' | 'publish' — why the snapshot was taken. */
  reason: z.string().max(40).default('manual'),
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

/**
 * How a stored credential is applied to an outbound HTTP request.
 * The secret material itself is stored encrypted (`secretEnc`); only
 * non-sensitive routing metadata lives in `meta`.
 */
export const WorkflowCredentialTypeSchema = z.enum([
  'bearer',
  'header',
  'basic',
  'query',
  'none',
]);

export const WorkflowCredentialSchema = z.object({
  /** Stable public id (uuid), unique per user. */
  credentialKey: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  type: WorkflowCredentialTypeSchema.default('bearer'),
  /** Encrypted JSON blob holding the secret (token/password/value). */
  secretEnc: z.string().default(''),
  /** JSON string of non-secret metadata (headerName, paramName, username). */
  meta: z.string().default('{}'),
});

export type WorkflowCredential = z.infer<typeof WorkflowCredentialSchema>;
export type WorkflowCredentialType = z.infer<typeof WorkflowCredentialTypeSchema>;

export type AgentWorkflow = z.infer<typeof AgentWorkflowSchema>;
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;
export type WorkflowComment = z.infer<typeof WorkflowCommentSchema>;
export type WorkflowRoyalty = z.infer<typeof WorkflowRoyaltySchema>;
export type WorkflowExecution = z.infer<typeof WorkflowExecutionSchema>;
export type WorkflowExecutionStatus = z.infer<typeof WorkflowExecutionStatusSchema>;
export type WorkflowVersion = z.infer<typeof WorkflowVersionSchema>;
