import type { ToolModule } from '../shared/tool-module.js';
import { executeSaveRagPipeline } from './execute.js';

/** Pipeline-only: one shortened schema document per table. No SQL examples. */
export const saveRagToolModule: ToolModule = {
  kind: 'save-rag',
  toolClass: 'persist',
  executePipeline: executeSaveRagPipeline,
};
