import type { WorkflowDefinition } from '../domain/domain.js';
import type { NodePluginRegistry, WorkflowNodePlugin } from './types.js';
import { executeActionInApp } from './action-in-app/execute.js';
import { executeAgent } from './agent/execute.js';
import { executeCode } from './code/execute.js';
import { executeCore } from './core/execute.js';
import { executeDataTransformation } from './data-transformation/execute.js';
import { executeFlow } from './flow/execute.js';
import { executeHttpRequest } from './http-request/execute.js';
import { humanReviewPlugin } from './human-review/index.js';
import { executeTrigger } from './trigger/execute.js';
import { coreWebhookPlugin, webhookTriggerPlugin } from './webhook/index.js';

function kindFromNode(node: WorkflowDefinition['nodes'][number]): string | undefined {
  const data = (node.data ?? {}) as Record<string, unknown>;
  if (typeof data.coreKind === 'string') return data.coreKind;
  if (typeof data.flowKind === 'string') return data.flowKind;
  if (typeof data.triggerKind === 'string') return data.triggerKind;
  return undefined;
}

const BUILTIN_PLUGINS: WorkflowNodePlugin[] = [
  { id: 'trigger', runtimeType: 'trigger', execute: executeTrigger },
  webhookTriggerPlugin,
  { id: 'http_request', runtimeType: 'http_request', execute: executeHttpRequest },
  { id: 'core:http_request', runtimeType: 'http_request', kind: 'http_request', execute: executeHttpRequest },
  { id: 'code', runtimeType: 'code', execute: executeCode },
  { id: 'core:code', runtimeType: 'code', kind: 'code', execute: executeCode },
  { id: 'agent', runtimeType: 'agent', execute: executeAgent },
  { id: 'flow', runtimeType: 'flow', execute: executeFlow },
  { id: 'core', runtimeType: 'core', execute: executeCore },
  coreWebhookPlugin,
  { id: 'action_in_app', runtimeType: 'action_in_app', execute: executeActionInApp },
  { id: 'data_transformation', runtimeType: 'data_transformation', execute: executeDataTransformation },
  humanReviewPlugin,
  { id: 'service_node', runtimeType: 'service_node', skipExecution: true },
  { id: 'memory_node', runtimeType: 'memory_node', skipExecution: true },
  { id: 'tool_node', runtimeType: 'tool_node', skipExecution: true },
  { id: 'sticky_note', runtimeType: 'sticky_note', skipExecution: true },
  { id: 'workflow_group', runtimeType: 'workflow_group', skipExecution: true },
];

class Registry implements NodePluginRegistry {
  private byId = new Map<string, WorkflowNodePlugin>();
  private byTriggerType = new Map<string, WorkflowNodePlugin>();

  constructor(plugins: WorkflowNodePlugin[]) {
    for (const plugin of plugins) {
      this.byId.set(plugin.id, plugin);
      if (plugin.trigger?.type) {
        this.byTriggerType.set(plugin.trigger.type, plugin);
      }
    }
  }

  get(key: string): WorkflowNodePlugin | undefined {
    return this.byId.get(key);
  }

  resolve(node: WorkflowDefinition['nodes'][number]): WorkflowNodePlugin | undefined {
    const kind = kindFromNode(node);
    if (kind) {
      const byComposite = this.byId.get(`${node.type}:${kind}`);
      if (byComposite) return byComposite;
      const byKind = [...this.byId.values()].find(
        (p) => p.runtimeType === node.type && p.kind === kind,
      );
      if (byKind) return byKind;
    }
    return this.byId.get(node.type);
  }

  findByTriggerType(type: string): WorkflowNodePlugin | undefined {
    return this.byTriggerType.get(type);
  }

  all(): WorkflowNodePlugin[] {
    return [...this.byId.values()];
  }
}

export function registerAllNodes(): NodePluginRegistry {
  return new Registry(BUILTIN_PLUGINS);
}

export const nodePluginRegistry = registerAllNodes();

export type { NodeContext, NodeOutput, WorkflowNodePlugin, NodePluginRegistry } from './types.js';
