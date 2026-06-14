import type { z } from 'zod';

import type { WorkflowDefinition } from '../domain/domain.js';
import type { UserDO } from '../../../ws/infrastructure/UserDO.js';
import type { BuildWebhookItemParams } from './webhook/output.js';

export type NodeOutput = Record<string, unknown>;

export interface WorkflowMeta {
  ownerId: string;
  workflowId: number;
  isOwnedByUser: boolean;
  workflowName: string;
  workflowDescription?: string;
}

export interface WorkflowAttribution {
  workflowId: number;
  workflowOwnerId: string;
  workflowName?: string;
}

export interface RequestMeta {
  userAgent?: string;
  ipAddress?: string;
}

export interface NodeContext {
  node: WorkflowDefinition['nodes'][number];
  nodeInput: NodeOutput;
  definition: WorkflowDefinition;
  outputs: Record<string, NodeOutput>;
  runContext: NodeOutput;
  input?: string;
  c: any;
  bindingName: string;
  user: { identifier: string };
  userDO: DurableObjectStub<UserDO>;
  meta: WorkflowMeta;
  attr?: WorkflowAttribution;
  requestMeta?: RequestMeta;
  webhookItem?: BuildWebhookItemParams;
  onCost?: (vnd: number) => void;
}

export interface TriggerRecord {
  triggerId: string;
  ownerId: string;
  workflowId: number;
  type: string;
  webhookToken?: string | null;
  input?: string | null;
}

export interface TriggerInput {
  input: string;
  trigger: TriggerRecord;
}

export interface CreateTriggerOpts {
  db: D1Database;
  ownerId: string;
  workflowId: number;
  config?: Record<string, unknown>;
}

export interface WorkflowNodePlugin {
  id: string;
  runtimeType: string;
  kind?: string;
  dataSchema?: z.ZodType;
  execute?: (ctx: NodeContext) => Promise<NodeOutput>;
  trigger?: {
    type: string;
    create: (opts: CreateTriggerOpts) => Promise<TriggerRecord>;
    handle: (
      request: Request,
      trigger: TriggerRecord,
      ctx: { db: D1Database; env: Env; bindingName: string },
    ) => Promise<TriggerInput>;
    delete?: (trigger: TriggerRecord) => Promise<void>;
  };
  skipExecution?: boolean;
  /** Engine handles pause/resume outside execute(). */
  engineFlowControl?: 'human_review';
}

export interface NodePluginRegistry {
  get(key: string): WorkflowNodePlugin | undefined;
  resolve(node: WorkflowDefinition['nodes'][number]): WorkflowNodePlugin | undefined;
  findByTriggerType(type: string): WorkflowNodePlugin | undefined;
  all(): WorkflowNodePlugin[];
}
