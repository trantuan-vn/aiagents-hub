import type { WorkflowDefinition } from '../domain/domain.js';
import { resolveVectorizeScope, type VectorizeScopeContext } from '../vectorize-scope.js';
import { isBranchSourceHandle } from './flow-helpers.js';

export type { VectorizeScopeContext };

export type ResourceHandle = 'service' | 'memory' | 'tools';

const RESOURCE_HANDLES = new Set<ResourceHandle>(['service', 'memory', 'tools']);

export function isResourceEdge(edge: Pick<WorkflowDefinition['edges'][number], 'sourceHandle' | 'targetHandle'>): boolean {
  const handle = (edge.sourceHandle ?? edge.targetHandle) as ResourceHandle | undefined;
  return handle != null && RESOURCE_HANDLES.has(handle);
}

/** Data-flow edge into `in` from a branch or main output handle (not resource wiring). */
export function isDataFlowEdge(edge: Pick<WorkflowDefinition['edges'][number], 'sourceHandle' | 'targetHandle'>): boolean {
  if (isResourceEdge(edge)) return false;
  const targetHandle = edge.targetHandle ?? 'in';
  if (targetHandle !== 'in') return false;
  const sourceHandle = edge.sourceHandle ?? 'out';
  return isBranchSourceHandle(sourceHandle);
}

/** @deprecated use isDataFlowEdge */
export function isMainFlowEdge(edge: Pick<WorkflowDefinition['edges'][number], 'sourceHandle' | 'targetHandle'>): boolean {
  return isDataFlowEdge(edge) && (edge.sourceHandle ?? 'out') === 'out';
}

/** Node types wired only as sub-resources on the canvas — not executed in the main chain. */
export function isResourceNodeType(type: string): boolean {
  return type === 'service_node' || type === 'memory_node' || type === 'tool_node';
}

export function isNonExecutableNodeType(type: string): boolean {
  return isResourceNodeType(type) || type === 'sticky_note';
}

export function getExecutableNodes(definition: WorkflowDefinition): WorkflowDefinition['nodes'] {
  return definition.nodes.filter((n) => !isNonExecutableNodeType(n.type));
}

export function getIncomingDataFlowEdges(
  definition: WorkflowDefinition,
  nodeId: string,
): WorkflowDefinition['edges'] {
  return definition.edges.filter((e) => e.target === nodeId && isDataFlowEdge(e));
}

export function getOutgoingDataFlowEdges(
  definition: WorkflowDefinition,
  nodeId: string,
): WorkflowDefinition['edges'] {
  return definition.edges.filter((e) => e.source === nodeId && isDataFlowEdge(e));
}

/** Entry nodes: no incoming data-flow edges (typical triggers). */
export function getWorkflowEntryNodeIds(definition: WorkflowDefinition): string[] {
  const executable = getExecutableNodes(definition);
  const hasIncoming = new Set(
    definition.edges.filter(isDataFlowEdge).map((e) => e.target),
  );
  return executable.filter((n) => !hasIncoming.has(n.id)).map((n) => n.id);
}

export function isMergeFlowNode(node: WorkflowDefinition['nodes'][number]): boolean {
  if (node.type !== 'flow') return false;
  const data = (node.data ?? {}) as Record<string, unknown>;
  return String(data.flowKind ?? '') === 'merge';
}

export function mergeMode(node: WorkflowDefinition['nodes'][number]): 'append' | 'wait_all' {
  const data = (node.data ?? {}) as Record<string, unknown>;
  return data.mergeMode === 'wait_all' ? 'wait_all' : 'append';
}

type NodeOutput = Record<string, unknown>;

/** All upstream parents on data-flow edges have produced output. */
export function mergeParentsReady(
  nodeId: string,
  definition: WorkflowDefinition,
  outputs: Record<string, NodeOutput>,
): boolean {
  const parents = getIncomingDataFlowEdges(definition, nodeId).map((e) => e.source);
  if (!parents.length) return true;
  return parents.every((p) => outputs[p] !== undefined);
}

export function topologicalMainFlowOrder(definition: WorkflowDefinition): string[] {
  const { nodes, edges } = definition;
  const executableIds = nodes.filter((n) => !isNonExecutableNodeType(n.type)).map((n) => n.id);
  const executableSet = new Set(executableIds);
  const mainEdges = edges.filter((e) => isDataFlowEdge(e) && (e.sourceHandle ?? 'out') === 'out');

  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const id of executableIds) {
    inDegree.set(id, 0);
    adj.set(id, []);
  }

  for (const e of mainEdges) {
    if (!executableSet.has(e.source) || !executableSet.has(e.target)) continue;
    adj.get(e.source)!.push(e.target);
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
  }

  const queue = executableIds.filter((id) => (inDegree.get(id) ?? 0) === 0);
  const order: string[] = [];

  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of adj.get(id) ?? []) {
      const d = (inDegree.get(next) ?? 1) - 1;
      inDegree.set(next, d);
      if (d === 0) queue.push(next);
    }
  }

  for (const id of executableIds) {
    if (!order.includes(id)) order.push(id);
  }

  return order;
}

/** Merge outputs from main-flow parent nodes (out → in). */
export function gatherMainFlowInputs(
  nodeId: string,
  edges: WorkflowDefinition['edges'],
  outputs: Record<string, NodeOutput>,
): NodeOutput {
  const parents = edges
    .filter((e) => e.target === nodeId && isDataFlowEdge(e))
    .map((e) => e.source);

  if (!parents.length) return {};

  const merged: NodeOutput = { parents: {} as Record<string, NodeOutput> };
  const parentMap = merged.parents as Record<string, NodeOutput>;

  for (const p of parents) {
    parentMap[p] = outputs[p] ?? {};
  }

  const lastParent = outputs[parents[parents.length - 1]] ?? {};
  return { ...lastParent, ...merged };
}

export interface AgentResourceContext {
  serviceEndpoint?: string;
  serviceOptions?: Record<string, unknown>;
  memoryCollection?: string;
  memoryKind?: string;
  memoryNamespace?: string;
  memoryNodeId?: string;
  tools: Array<Record<string, unknown>>;
}
export type { VectorizeScopeContext };

export function resolveAgentResources(
  definition: WorkflowDefinition,
  agentId: string,
  scope?: VectorizeScopeContext,
): AgentResourceContext {
  const nodeById = new Map(definition.nodes.map((n) => [n.id, n]));
  const tools: Array<Record<string, unknown>> = [];
  let serviceEndpoint: string | undefined;
  let serviceOptions: Record<string, unknown> | undefined;
  let memoryCollection: string | undefined;
  let memoryKind: string | undefined;
  let memoryNamespace: string | undefined;
  let memoryNodeId: string | undefined;

  for (const edge of definition.edges) {
    if (edge.target !== agentId || !edge.targetHandle) continue;
    const source = nodeById.get(edge.source);
    if (!source) continue;

    const handle = edge.targetHandle as ResourceHandle;
    const data = (source.data ?? {}) as Record<string, unknown>;

    if (handle === 'service' && source.type === 'service_node') {
      serviceEndpoint = String(data.endpoint ?? data.catalogId ?? data.serviceEndpoint ?? '').trim() || serviceEndpoint;
      const opts = data.serviceOptions;
      if (opts && typeof opts === 'object' && !Array.isArray(opts)) {
        serviceOptions = opts as Record<string, unknown>;
      }
    }

    if (handle === 'memory' && source.type === 'memory_node') {
      memoryNodeId = source.id;
      memoryKind = String(data.memoryKind ?? 'vectorize');
      memoryCollection = String(data.collection ?? data.memoryCollection ?? 'VECTORIZE');
      const configuredNamespace = String(data.namespace ?? '').trim();
      if (scope?.ownerId && scope.workflowId) {
        memoryNamespace = resolveVectorizeScope(
          scope.ownerId,
          scope.workflowId,
          source.id,
          configuredNamespace,
        );
      } else {
        memoryNamespace = configuredNamespace || memoryNamespace;
      }
    }

    if (handle === 'tools' && source.type === 'tool_node') {
      tools.push({
        id: source.id,
        kind: data.toolKind ?? 'http-request',
        label: data.label,
        config: data,
      });
    }
  }

  return { serviceEndpoint, serviceOptions, memoryCollection, memoryKind, memoryNamespace, memoryNodeId, tools };
}
