import { tool } from 'ai';
import { z } from 'zod';

import { resolveConfiguredText } from '../shared/pipeline.js';
import type { ToolModule } from '../shared/tool-module.js';
import { executeGetRag, executeGetRagPipeline } from './execute.js';

export const getRagToolModule: ToolModule = {
  kind: 'get-rag',
  toolClass: 'retrieve',
  executePipeline: executeGetRagPipeline,
  createAgentTool: (bind) => ({
    name: bind.toolName,
    tool: tool({
      description: bind.toolDescription,
      inputSchema: z.object({
        query: z.string().describe('Search query'),
        topK: z.number().optional(),
        namespace: z.string().optional(),
        docType: z.string().optional().describe('Filter by docType metadata (schema | sqlexample)'),
      }),
      execute: async (input) => {
        const query =
          String(input.query ?? '').trim() ||
          resolveConfiguredText(bind.toolConfig.queryField, bind.triggerContext, '');
        return executeGetRag({
          env: bind.env,
          definition: bind.definition,
          agentId: bind.agentId,
          input: { ...input, query },
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
