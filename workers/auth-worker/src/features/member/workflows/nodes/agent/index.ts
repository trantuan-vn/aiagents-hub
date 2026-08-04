import {
  AGENT_KINDS,
  AGENT_OVERRIDE_KINDS,
  type AgentKind,
} from '@aiagents-hub/workflow-nodes';

import type { WorkflowNodePlugin } from '../types.js';
import { executeAgent } from './execute.js';

export { executeAgent } from './execute.js';

/** Base agent — fallback when no agentKind is set (legacy graphs). */
export const agentPlugin: WorkflowNodePlugin = {
  id: 'agent',
  runtimeType: 'agent',
  execute: executeAgent,
};

export function createAgentKindPlugin(kind: AgentKind): WorkflowNodePlugin {
  return {
    id: `agent:${kind}`,
    runtimeType: 'agent',
    kind,
    execute: executeAgent,
  };
}

export const AGENT_KIND_PLUGINS: WorkflowNodePlugin[] = AGENT_KINDS.filter(
  (kind) => !AGENT_OVERRIDE_KINDS.has(kind),
).map(createAgentKindPlugin);
