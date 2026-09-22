import {
  AGENT_KINDS,
  AGENT_OVERRIDE_KINDS,
  type AgentKind,
} from '@aiagents-hub/workflow-nodes';

import type { WorkflowNodePlugin } from '../types.js';
import { AGENT_PERSIST_SHAPE } from '../../engine/persist-shapes.js';
import { executeAgent } from './execute.js';
import { executeReasoningAgent } from './execute-reasoning.js';

export { executeAgent } from './execute.js';
export { executeReasoningAgent } from './execute-reasoning.js';

/** Base agent — fallback when no agentKind is set (legacy graphs). */
export const agentPlugin: WorkflowNodePlugin = {
  id: 'agent',
  runtimeType: 'agent',
  execute: executeAgent,
  ...AGENT_PERSIST_SHAPE,
};

export function createAgentKindPlugin(kind: AgentKind): WorkflowNodePlugin {
  return {
    id: `agent:${kind}`,
    runtimeType: 'agent',
    kind,
    execute: executeAgent,
    ...AGENT_PERSIST_SHAPE,
  };
}

export const AGENT_KIND_PLUGINS: WorkflowNodePlugin[] = AGENT_KINDS.filter(
  (kind) => !AGENT_OVERRIDE_KINDS.has(kind),
).map(createAgentKindPlugin);

export const agentReasoningPlugin: WorkflowNodePlugin = {
  id: 'agent:reasoning_agent',
  runtimeType: 'agent',
  kind: 'reasoning_agent',
  execute: executeReasoningAgent,
  ...AGENT_PERSIST_SHAPE,
};
