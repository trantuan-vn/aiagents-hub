import {
  TRIGGER_KINDS,
  TRIGGER_OVERRIDE_KINDS,
  type TriggerKind,
} from '@aiagents-hub/workflow-nodes';

import type { WorkflowNodePlugin } from '../types.js';
import { executeTrigger } from './execute.js';

export { executeTrigger } from './execute.js';

/** Base trigger — fallback when no triggerKind is set. */
export const triggerPlugin: WorkflowNodePlugin = {
  id: 'trigger',
  runtimeType: 'trigger',
  execute: executeTrigger,
};

export function createTriggerKindPlugin(kind: TriggerKind): WorkflowNodePlugin {
  return {
    id: `trigger:${kind}`,
    runtimeType: 'trigger',
    kind,
    execute: executeTrigger,
  };
}

/** Factory plugins for kinds without dedicated override modules (skips webhook + form). */
export const TRIGGER_KIND_PLUGINS: WorkflowNodePlugin[] = TRIGGER_KINDS.filter(
  (kind) => !TRIGGER_OVERRIDE_KINDS.has(kind),
).map(createTriggerKindPlugin);

/**
 * Form override slot — shares base execute; FE owns custom canvas/panel.
 * (webhook override lives in `nodes/webhook/`)
 */
export const triggerFormPlugin: WorkflowNodePlugin = {
  id: 'trigger:form',
  runtimeType: 'trigger',
  kind: 'form',
  execute: executeTrigger,
};
