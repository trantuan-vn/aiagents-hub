import { tool } from 'ai';
import { z } from 'zod';

import { resolveConfiguredText } from '../shared/pipeline.js';
import type { ToolModule } from '../shared/tool-module.js';
import type { AiCallStamp } from '../../../ai/workers-ai.js';
import { executeGetRag, executeGetRagPipeline } from './execute.js';

const GET_RAG_TOOL_DESCRIPTION =
  'Return similar question–SQL pairs first, then related table schema. Do not call when that two-part context is already in the prompt.';

export const getRagToolModule: ToolModule = {
  kind: 'get-rag',
  toolClass: 'retrieve',
  executePipeline: executeGetRagPipeline,
  createAgentTool: (bind) => ({
    name: bind.toolName,
    tool: tool({
      description: bind.toolDescription || GET_RAG_TOOL_DESCRIPTION,
      inputSchema: z.object({
        query: z.string().describe('User question (embed as-is; Vietnamese OK)'),
        topK: z.number().optional().describe('Max schema tables to return'),
        namespace: z.string().optional(),
      }),
      execute: async (input) => {
        const query =
          String(input.query ?? '').trim() ||
          resolveConfiguredText(bind.toolConfig.queryField, bind.triggerContext, '');
        const stamp: AiCallStamp | undefined = bind.aiCall
          ? {
              executionKey: bind.aiCall.executionKey,
              workflowId: bind.aiCall.workflowId,
              nodeId: bind.toolId || bind.aiCall.nodeId,
              kind: 'embed',
            }
          : undefined;
        return executeGetRag({
          env: bind.env,
          definition: bind.definition,
          agentId: bind.agentId,
          input: { query, topK: input.topK, namespace: input.namespace },
          embedModel: bind.embedModel,
          userDO: bind.userDO,
          ownerId: bind.ownerId,
          workflowId: bind.workflowId,
          billing: bind.billing,
          triggerContext: bind.triggerContext,
          stamp,
        });
      },
    }),
  }),
};
