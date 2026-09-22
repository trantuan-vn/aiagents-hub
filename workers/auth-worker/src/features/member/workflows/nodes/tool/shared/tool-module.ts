import type { Tool } from 'ai';

import type { UserDO } from '../../../../../ws/infrastructure/UserDO.js';
import type { WorkflowDefinition } from '../../../domain/domain.js';
import type { NodeContext, NodeOutput } from '../../types.js';
import type { RagBilling } from './rag-context.js';

/** Declared on ToolModule — reasoning policy reads this instead of guessing from the tool name. */
export type WorkflowToolClass = 'retrieve' | 'persist' | 'validate' | 'other';

export type AgentToolBindContext = {
  env: Env;
  userDO: DurableObjectStub<UserDO>;
  definition: WorkflowDefinition;
  agentId: string;
  triggerContext: Record<string, unknown>;
  embedModel?: string;
  ownerId?: string;
  workflowId?: number;
  billing?: RagBilling;
  toolId: string;
  toolConfig: Record<string, unknown>;
  toolName: string;
  toolDescription: string;
};

export type ToolModule = {
  kind: string;
  toolClass: WorkflowToolClass;
  /** Data-flow. Omit when the tool is agent-only. */
  executePipeline?: (ctx: NodeContext) => Promise<NodeOutput>;
  /** AI SDK tool. Omit when the tool is pipeline-only. */
  createAgentTool?: (bind: AgentToolBindContext) => { name: string; tool: Tool } | null;
};
