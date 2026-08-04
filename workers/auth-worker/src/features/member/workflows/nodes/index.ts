import type { WorkflowDefinition } from '../domain/domain.js';
import type { NodePluginRegistry, WorkflowNodePlugin } from './types.js';
import { actionInAppPlugin } from './action-in-app/index.js';
import { agentPlugin, AGENT_KIND_PLUGINS } from './agent/index.js';
import { codePlugin, coreCodePlugin } from './code/index.js';
import { corePlugin, CORE_KIND_PLUGINS } from './core/index.js';
import {
  dataTransformationPlugin,
  TRANSFORM_KIND_PLUGINS,
} from './data-transformation/index.js';
import { flowPlugin, FLOW_KIND_PLUGINS, flowLoopOverItemsPlugin } from './flow/index.js';
import { coreHttpRequestPlugin, httpRequestPlugin } from './http-request/index.js';
import { humanReviewPlugin, HUMAN_REVIEW_CHANNEL_PLUGINS } from './human-review/index.js';
import {
  memoryNodePlugin,
  MEMORY_KIND_PLUGINS,
  memoryVectorizePlugin,
} from './memory-node/index.js';
import { serviceNodePlugin } from './service-node/index.js';
import { stickyNotePlugin } from './sticky-note/index.js';
import {
  toolNodePlugin,
  TOOL_KIND_PLUGINS,
  toolSaveRagPlugin,
  toolGetRagPlugin,
  toolGetDbInfoPlugin,
} from './tool/index.js';
import { triggerPlugin, TRIGGER_KIND_PLUGINS, triggerFormPlugin } from './trigger/index.js';
import { coreWebhookPlugin, webhookTriggerPlugin } from './webhook/index.js';
import { workflowGroupPlugin } from './workflow-group/index.js';

function kindFromNode(node: WorkflowDefinition['nodes'][number]): string | undefined {
  const data = (node.data ?? {}) as Record<string, unknown>;
  if (typeof data.coreKind === 'string') return data.coreKind;
  if (typeof data.flowKind === 'string') return data.flowKind;
  if (typeof data.triggerKind === 'string') return data.triggerKind;
  if (typeof data.toolKind === 'string') return data.toolKind;
  if (typeof data.transformKind === 'string') return data.transformKind;
  if (typeof data.memoryKind === 'string') return data.memoryKind;
  if (typeof data.agentKind === 'string') return data.agentKind;
  if (typeof data.channel === 'string' && node.type === 'human_review') return data.channel;
  return undefined;
}

const BUILTIN_PLUGINS: WorkflowNodePlugin[] = [
  // Family bases
  triggerPlugin,
  flowPlugin,
  corePlugin,
  actionInAppPlugin,
  dataTransformationPlugin,
  humanReviewPlugin,
  agentPlugin,
  serviceNodePlugin,
  memoryNodePlugin,
  toolNodePlugin,
  stickyNotePlugin,
  workflowGroupPlugin,
  // Kind factories
  ...TRIGGER_KIND_PLUGINS,
  triggerFormPlugin,
  ...FLOW_KIND_PLUGINS,
  flowLoopOverItemsPlugin,
  ...CORE_KIND_PLUGINS,
  ...TRANSFORM_KIND_PLUGINS,
  ...HUMAN_REVIEW_CHANNEL_PLUGINS,
  ...AGENT_KIND_PLUGINS,
  ...MEMORY_KIND_PLUGINS,
  memoryVectorizePlugin,
  ...TOOL_KIND_PLUGINS,
  toolSaveRagPlugin,
  toolGetRagPlugin,
  toolGetDbInfoPlugin,
  // Overrides (dedicated modules — win by id over any factory duplicate)
  webhookTriggerPlugin,
  coreWebhookPlugin,
  httpRequestPlugin,
  coreHttpRequestPlugin,
  codePlugin,
  coreCodePlugin,
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
