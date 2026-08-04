import type { WorkflowNodePlugin } from '../types.js';
import { executeCode } from './execute.js';

export { executeCode } from './execute.js';

export const codePlugin: WorkflowNodePlugin = {
  id: 'code',
  runtimeType: 'code',
  execute: executeCode,
};

/** Legacy core + kind alias used by graphs stored as type core / coreKind code. */
export const coreCodePlugin: WorkflowNodePlugin = {
  id: 'core:code',
  runtimeType: 'code',
  kind: 'code',
  execute: executeCode,
};
