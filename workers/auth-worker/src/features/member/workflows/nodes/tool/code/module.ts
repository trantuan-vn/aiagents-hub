import type { ToolModule } from '../shared/tool-module.js';

/**
 * Code Mode node — agent-only.
 * Outer tool is built in agent-runtime via createCodeModeOuterTool once
 * get-rag + check-sql siblings are linked (collapse). createAgentTool alone
 * returns null because inner tools are not known at module registration time.
 */
export const codeToolModule: ToolModule = {
  kind: 'code',
  toolClass: 'delegate',
  createAgentTool: () => null,
};
