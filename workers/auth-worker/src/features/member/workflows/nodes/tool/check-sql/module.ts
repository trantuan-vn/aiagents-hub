import { tool } from 'ai';
import { z } from 'zod';

import type { ToolModule } from '../shared/tool-module.js';
import { executeCheckSql } from './execute.js';

const CHECK_SQL_DESCRIPTION =
  'Validate a SELECT (or WITH) on Oracle via EXPLAIN PLAN (no row fetch). Call after retrieve tools have schema. On ok: false, use the error to repair SQL and call again.';

export const checkSqlToolModule: ToolModule = {
  kind: 'check-sql',
  toolClass: 'validate',
  createAgentTool: (bind) => {
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
            maxRows: Number(bind.toolConfig.maxRows ?? 5),
            triggerContext: bind.triggerContext,
            toolConfig: bind.toolConfig,
          }),
      }),
    };
  },
};
