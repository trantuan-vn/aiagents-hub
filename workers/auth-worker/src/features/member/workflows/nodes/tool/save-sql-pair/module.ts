import type { ToolModule } from '../shared/tool-module.js';
import { executeSaveSqlPairPipeline } from './execute.js';

/** Pipeline-only. A system prompt rewrites the question with the linked LLM before embed. */
export const saveSqlPairToolModule: ToolModule = {
  kind: 'save-sql-pair',
  toolClass: 'persist',
  executePipeline: executeSaveSqlPairPipeline,
};
