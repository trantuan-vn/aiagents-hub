import { tool } from 'ai';
import { z } from 'zod';

import { resolveConfiguredText } from '../shared/pipeline.js';
import type { ToolModule } from '../shared/tool-module.js';
import { executeGetRag, executeGetRagPipeline } from './execute.js';

const GET_RAG_TOOL_DESCRIPTION =
  'Find related table schema (VI/EN column descriptions) and SQL examples for the user question so you can write SELECT. Do not call when schema snippets are already in context.';

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
        topK: z.number().optional().describe('Max related tables to return'),
        namespace: z.string().optional(),
      }),
      execute: async (input) => {
        const query =
          String(input.query ?? '').trim() ||
          resolveConfiguredText(bind.toolConfig.queryField, bind.triggerContext, '');
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
        });
      },
    }),
  }),
};
