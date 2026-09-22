import { tool } from 'ai';
import { z } from 'zod';

import type { ToolModule } from '../shared/tool-module.js';
import { executeCheckSql } from './execute.js';

const CHECK_SQL_DESCRIPTION =
  'Run a SELECT (or WITH) on Oracle and return parser/execution errors if the statement is wrong. Call after get_rag has schema, before treating SQL as the final answer. Do not use to fetch full result sets for the user.';

export const checkSqlToolModule: ToolModule = {
  kind: 'check-sql',
  toolClass: 'validate',
  createAgentTool: (bind) => {
    const maxRowsRaw = Number(bind.toolConfig.maxRows ?? 5);
    const maxRows = Math.min(20, Math.max(1, Number.isFinite(maxRowsRaw) ? Math.floor(maxRowsRaw) : 5));
    return {
      name: bind.toolName,
      tool: tool({
        description: bind.toolDescription || CHECK_SQL_DESCRIPTION,
        inputSchema: z.object({
          sql: z.string().describe('A single SELECT or WITH statement to validate on Oracle'),
        }),
        execute: async (input) =>
          executeCheckSql({
            env: bind.env,
            sql: String(input.sql ?? ''),
            maxRows,
            triggerContext: bind.triggerContext,
          }),
      }),
    };
  },
};
