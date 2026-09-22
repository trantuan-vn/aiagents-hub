import { getDbInfoToolModule } from '../get-db-info/module.js';
import { getRagToolModule } from '../get-rag/module.js';
import { saveRagToolModule } from '../save-rag/module.js';
import type { ToolModule, WorkflowToolClass } from './tool-module.js';

/** Single registry — dispatcher and agent toolset only read this list. */
export const TOOL_MODULES: ToolModule[] = [
  getDbInfoToolModule,
  saveRagToolModule,
  getRagToolModule,
];

export function getToolModule(kind: string): ToolModule | undefined {
  return TOOL_MODULES.find((m) => m.kind === kind);
}

export function toolClassForKind(kind: string): WorkflowToolClass | undefined {
  return getToolModule(kind)?.toolClass;
}

/** Map agent tool function name (snake_case) back to the module kind. */
export function toolClassForToolName(name: string): WorkflowToolClass | undefined {
  const normalized = name.toLowerCase().replace(/-/g, '_');
  for (const mod of TOOL_MODULES) {
    const kindSnake = mod.kind.replace(/-/g, '_');
    if (normalized === kindSnake) return mod.toolClass;
  }
  return undefined;
}
