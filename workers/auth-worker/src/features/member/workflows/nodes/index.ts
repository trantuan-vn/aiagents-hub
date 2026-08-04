import type { WorkflowDefinition } from '../domain/domain.js';
import type { NodePluginRegistry, WorkflowNodePlugin } from './types.js';
import { actionInAppPlugin } from './action-in-app/index.js';
import { agentPlugin } from './agent/index.js';
import { codePlugin, coreCodePlugin } from './code/index.js';
import { corePlugin } from './core/index.js';
import { dataTransformationPlugin } from './data-transformation/index.js';
import { flowPlugin } from './flow/index.js';
import { coreHttpRequestPlugin, httpRequestPlugin } from './http-request/index.js';
import { humanReviewPlugin } from './human-review/index.js';
import { memoryNodePlugin } from './memory-node/index.js';
import { serviceNodePlugin } from './service-node/index.js';
import { stickyNotePlugin } from './sticky-note/index.js';
import { toolNodePlugin } from './tool/index.js';
import { triggerPlugin } from './trigger/index.js';
import { coreWebhookPlugin, webhookTriggerPlugin } from './webhook/index.js';
import { workflowGroupPlugin } from './workflow-group/index.js';

function kindFromNode(node: WorkflowDefinition['nodes'][number]): string | undefined {
  const data = (node.data ?? {}) as Record<string, unknown>;
  if (typeof data.coreKind === 'string') return data.coreKind;
  if (typeof data.flowKind === 'string') return data.flowKind;
  if (typeof data.triggerKind === 'string') return data.triggerKind;
  return undefined;
}

const BUILTIN_PLUGINS: WorkflowNodePlugin[] = [
  triggerPlugin,
  webhookTriggerPlugin,
  httpRequestPlugin,
  coreHttpRequestPlugin,
  codePlugin,
  coreCodePlugin,
  agentPlugin,
  flowPlugin,
  corePlugin,
  coreWebhookPlugin,
  actionInAppPlugin,
  dataTransformationPlugin,
  humanReviewPlugin,
  serviceNodePlugin,
  memoryNodePlugin,
  toolNodePlugin,
  stickyNotePlugin,
  workflowGroupPlugin,
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
