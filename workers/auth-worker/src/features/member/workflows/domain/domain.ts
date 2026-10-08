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
  'workflow_group',
]);

export const WorkflowDefinitionSchema = z.object({
  nodes: z.array(
    z.object({
      id: z.string(),
      type: WorkflowNodeTypeSchema,
      position: z.object({ x: z.number(), y: z.number() }),
      data: z.record(z.unknown()).default({}),
      parentId: z.string().optional(),
      extent: z.literal('parent').optional(),
      style: z.record(z.unknown()).optional(),
      zIndex: z.number().optional(),
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
  minPlanId: z.enum(['free', 'starter', 'pro', 'business']).default('free'),
  graceWhenExhausted: z.boolean().default(false),
  /** JSON array of trigger kinds community users may start, e.g. `["chat","form"]`. Null allows all. */
  publicTriggerKinds: z.string().max(200).nullish(),
  /**
   * JSON array of share grants. Each row gives a trigger set to everyone (`all`)
   * or to specific login emails (`users`). Null keeps the legacy publicTriggerKinds rule.
   */
  shareGrants: z.string().max(60_000).nullish(),
  /** Owner labels workflow type (1–5 stars). */
  starCount: z.number().int().min(0).max(5).default(0),
  starLabel: z.string().max(100).optional(),
  usageCount: z.number().int().min(0).default(0),
  totalEarningsUsd: z.number().min(0).default(0),
  status: z.enum(['draft', 'published']).default('draft'),
  /** Only admin sets this (enterprise-organization-spec §3.1). Hidden from the public catalog when true. */
  isEnterprise: z.boolean().default(false),
  /** Organization the owner proposed. Null until proposed. */
  enterpriseId: z.string().max(64).nullish(),
  enterpriseAcceptance: z.enum(['none', 'pending', 'accepted']).default('none'),
  /** Royalty % frozen when the Business user accepts. Null until accepted. */
  acceptedRoyaltyPercent: z.number().min(0).max(100).nullish(),
});

/** Fields the owner may never write through member routes. */
export const ADMIN_ONLY_WORKFLOW_FIELDS = ['isEnterprise', 'enterpriseAcceptance', 'acceptedRoyaltyPercent'] as const;

/** Body for member create/update. Enterprise fields are written only by admin and organization routes. */
export const MemberWorkflowWriteSchema = AgentWorkflowSchema.omit({
  isEnterprise: true,
  enterpriseId: true,
  enterpriseAcceptance: true,
  acceptedRoyaltyPercent: true,
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

export const COMMENT_EMOJIS = ['like', 'love', 'haha', 'wow', 'sad'] as const;

/** Comment on a shared workflow (stored in commenter's DO, synced to D1). */
export const WorkflowCommentSchema = z.object({
  workflowOwnerId: z.string(),
  workflowId: z.number().int(),
  content: z.string().min(1).max(2000),
  rating: z.number().int().min(1).max(5).optional(),
  authorDisplayName: z.string().max(200).optional(),
  /** Stable id so replies work before D1 assigns globalId. */
  commentKey: z.string().min(8).max(80).optional(),
  /** Root comment this row replies to. Replies stay one level deep. */
  parentCommentKey: z.string().max(80).optional(),
  /** Author of the specific comment being answered, when that comment is itself a reply. */
  replyToName: z.string().max(80).optional(),
});

/** One viewer's reaction on a comment. `reactionKey` is unique per user. */
export const WorkflowCommentReactionSchema = z.object({
  reactionKey: z.string().min(1).max(200),
  workflowOwnerId: z.string(),
  workflowId: z.number().int(),
  commentKey: z.string().min(1).max(80),
  emoji: z.enum(COMMENT_EMOJIS),
  /** False hides a reaction the viewer turned off before the queue flush. */
  active: z.boolean().optional(),
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
  /** Dual-write of charged Credits (same value as totalCostVnd when BILLING_UNIT=credit). */
  totalCreditsCharged: z.number().min(0).optional(),
  totalCreditsRoyalty: z.number().min(0).optional(),
  /** Royalty deducted from the consumer wallet when running a shared workflow. */
  totalRoyaltyUsd: z.number().min(0).default(0),
  stepCount: z.number().int().min(0).default(0),
  /** JSON string of the serialized engine state for durable resume/replay. */
  state: z.string().default('{}'),
  /** Node currently awaiting a human decision (when status = pending_human). */
  pendingNodeId: z.string().optional(),
  startedAt: z.number().default(Date.now),
  finishedAt: z.number().optional(),
});

/**
 * Slim ledger projection for DO→Queue→D1→R2 (Phase B.1).
 * Control-plane `state` / I/O stay DO-local; never register this as the DO table schema.
 */
export const WorkflowExecutionLedgerSchema = WorkflowExecutionSchema.omit({
  state: true,
  input: true,
  output: true,
  pendingNodeId: true,
}).extend({
  error: z.string().max(500).optional(),
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
export type WorkflowExecutionLedger = z.infer<typeof WorkflowExecutionLedgerSchema>;
export type WorkflowExecutionStatus = z.infer<typeof WorkflowExecutionStatusSchema>;
export type WorkflowVersion = z.infer<typeof WorkflowVersionSchema>;

/**
 * Episodic memory for reasoning_agent, keyed per workflow/session/agent.
 * Kept DO-local (not queue-synced).
 */
export const AgentSessionMemorySchema = z.object({
  memoryKey: z.string().min(1).max(160),
  workflowId: z.number().int(),
  sessionId: z.string().min(1).max(80),
  agentId: z.string().min(1).max(80),
  summary: z.string().default(''),
  /** JSON array of { at, summary, status }. */
  episodes: z.string().default('[]'),
  updatedAt: z.number().default(Date.now),
});

export type AgentSessionMemory = z.infer<typeof AgentSessionMemorySchema>;

/**
 * Windowed chat turns for memory_node:simple, keyed per workflow/session/memory node.
 * Kept DO-local (not queue-synced).
 */
export const SimpleMemorySchema = z.object({
  memoryKey: z.string().min(1).max(160),
  workflowId: z.number().int(),
  sessionId: z.string().min(1).max(80),
  memoryNodeId: z.string().min(1).max(80),
  /** JSON array of { role: 'user' | 'assistant', content: string }. */
  messages: z.string().default('[]'),
  updatedAt: z.number().default(Date.now),
});

export type SimpleMemory = z.infer<typeof SimpleMemorySchema>;
