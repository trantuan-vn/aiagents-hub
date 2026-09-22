import type { ToolModule } from '../shared/tool-module.js';
import { executeSaveRagPipeline } from './execute.js';

/** Pipeline-only: schema ingest. No agent text/PDF tool. */
export const saveRagToolModule: ToolModule = {
  kind: 'save-rag',
  toolClass: 'persist',
  executePipeline: executeSaveRagPipeline,
};
