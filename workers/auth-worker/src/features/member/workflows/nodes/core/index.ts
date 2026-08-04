import {
  CORE_KINDS,
  CORE_OVERRIDE_KINDS,
  type CoreKind,
} from '@aiagents-hub/workflow-nodes';

import type { WorkflowNodePlugin } from '../types.js';
import { executeCore } from './execute.js';

export { executeCore } from './execute.js';

/** Base core — fallback when no coreKind is set. */
export const corePlugin: WorkflowNodePlugin = {
  id: 'core',
  runtimeType: 'core',
  execute: executeCore,
};

export function createCoreKindPlugin(kind: CoreKind): WorkflowNodePlugin {
  return {
    id: `core:${kind}`,
    runtimeType: 'core',
    kind,
    execute: executeCore,
  };
}

/** Factory plugins for kinds without dedicated override modules. */
export const CORE_KIND_PLUGINS: WorkflowNodePlugin[] = CORE_KINDS.filter(
  (kind) => !CORE_OVERRIDE_KINDS.has(kind),
).map(createCoreKindPlugin);
