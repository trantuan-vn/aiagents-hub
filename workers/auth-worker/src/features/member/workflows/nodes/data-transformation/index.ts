import {
  TRANSFORM_KINDS,
  TRANSFORM_OVERRIDE_KINDS,
  type TransformKind,
} from '@aiagents-hub/workflow-nodes';

import type { WorkflowNodePlugin } from '../types.js';
import { executeDataTransformation } from './execute.js';

export { executeDataTransformation } from './execute.js';

/** Base data_transformation — fallback when no transformKind is set. */
export const dataTransformationPlugin: WorkflowNodePlugin = {
  id: 'data_transformation',
  runtimeType: 'data_transformation',
  execute: executeDataTransformation,
};

export function createTransformKindPlugin(kind: TransformKind): WorkflowNodePlugin {
  return {
    id: `data_transformation:${kind}`,
    runtimeType: 'data_transformation',
    kind,
    execute: executeDataTransformation,
  };
}

export const TRANSFORM_KIND_PLUGINS: WorkflowNodePlugin[] = TRANSFORM_KINDS.filter(
  (kind) => !TRANSFORM_OVERRIDE_KINDS.has(kind),
).map(createTransformKindPlugin);
