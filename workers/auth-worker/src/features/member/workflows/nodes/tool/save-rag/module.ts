import { tool } from 'ai';
import { z } from 'zod';

import type { ToolModule } from '../shared/tool-module.js';
import { executeSaveRag, executeSaveRagPipeline } from './execute.js';

export const saveRagToolModule: ToolModule = {
  kind: 'save-rag',
  toolClass: 'persist',
  executePipeline: executeSaveRagPipeline,
  createAgentTool: (bind) => ({
    name: bind.toolName,
    tool: tool({
      description: bind.toolDescription,
      inputSchema: z.object({
        content: z.string().describe('Text content to embed and store'),
        documentId: z.string().optional(),
        source: z.string().optional(),
        chunks: z.array(z.object({ content: z.string(), index: z.number() })).optional(),
        metadata: z.record(z.string()).optional(),
      }),
      execute: async (input) =>
        executeSaveRag({
          env: bind.env,
          definition: bind.definition,
          agentId: bind.agentId,
          input,
          userDO: bind.userDO,
          ownerId: bind.ownerId,
          workflowId: bind.workflowId,
          billing: bind.billing,
        }),
    }),
  }),
};
