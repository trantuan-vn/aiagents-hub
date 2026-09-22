import { tool } from 'ai';
import { z } from 'zod';

import type { ToolModule } from '../shared/tool-module.js';
import { executeGetDbInfo, executeGetDbInfoPipeline } from './execute.js';

export const getDbInfoToolModule: ToolModule = {
  kind: 'get-db-info',
  toolClass: 'retrieve',
  executePipeline: executeGetDbInfoPipeline,
  createAgentTool: (bind) => ({
    name: bind.toolName,
    tool: tool({
      description: bind.toolDescription,
      inputSchema: z.object({
        schemaName: z.string().optional(),
        tableFilter: z.string().optional(),
      }),
      execute: async (input) =>
        executeGetDbInfo({
          env: bind.env,
          definition: bind.definition,
          agentId: bind.agentId,
          triggerContext: bind.triggerContext,
          input,
        }),
    }),
  }),
};
