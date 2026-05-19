import type { WorkflowDefinition, WorkflowNodeTypeSchema } from './domain.js';
import type { z } from 'zod';
import type { ResolvedWorkflow } from './workflow-context.js';
import { workflowAttribution } from './workflow-context.js';
import {
  billAgentUsage,
  ensureWalletBalance,
  extractTextFromAiResponse,
  getModelForService,
  resolveServiceByEndpoint,
  runTextModel,
} from './billing.js';
import { getIdFromName } from '../../../shared/utils.js';

type NodeType = z.infer<typeof WorkflowNodeTypeSchema>;

export interface ExecutionStepLog {
  nodeId: string;
  nodeType: NodeType;
  status: 'success' | 'error' | 'skipped' | 'pending_human';
  input?: unknown;
  output?: unknown;
  error?: string;
  costVnd?: number;
  durationMs?: number;
}

export interface WorkflowExecutionResult {
  status: 'completed' | 'failed' | 'pending_human';
  workflowId: number;
  workflowOwnerId: string;
  output?: unknown;
  steps: ExecutionStepLog[];
  totalCostVnd: number;
}

export interface ExecuteWorkflowParams {
  c: any;
  bindingName: string;
  user: { identifier: string };
  resolved: ResolvedWorkflow;
  input?: string;
  variables?: Record<string, unknown>;
  autoApproveHumanReview?: boolean;
  requestMeta?: { userAgent?: string; ipAddress?: string };
}

type NodeOutput = Record<string, unknown>;

function topologicalOrder(definition: WorkflowDefinition): string[] {
  const { nodes, edges } = definition;
  const ids = nodes.map((n) => n.id);
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const id of ids) {
    inDegree.set(id, 0);
    adj.set(id, []);
  }
  for (const e of edges) {
    if (!adj.has(e.source) || !inDegree.has(e.target)) continue;
    adj.get(e.source)!.push(e.target);
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
  }

  const queue = ids.filter((id) => (inDegree.get(id) ?? 0) === 0);
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

  if (order.length < ids.length) {
    for (const id of ids) {
      if (!order.includes(id)) order.push(id);
    }
  }
  return order;
}

function gatherInputs(
  nodeId: string,
  edges: WorkflowDefinition['edges'],
  outputs: Map<string, NodeOutput>,
): NodeOutput {
  const parents = edges.filter((e) => e.target === nodeId).map((e) => e.source);
  if (!parents.length) return {};
  const merged: NodeOutput = { parents: {} as Record<string, NodeOutput> };
  const parentMap = merged.parents as Record<string, NodeOutput>;
  for (const p of parents) {
    parentMap[p] = outputs.get(p) ?? {};
  }
  const last = outputs.get(parents[parents.length - 1]);
  if (last?.text) merged.text = last.text;
  if (last?.data) merged.data = last.data;
  return merged;
}

async function queryVectorMemory(
  env: Env,
  collection: string,
  query: string,
): Promise<string[]> {
  const binding = (env as Record<string, unknown>).VECTORIZE as
    | { query: (vector: number[], opts: { topK: number }) => Promise<{ matches?: { metadata?: Record<string, string> }[] }> }
    | undefined;
  if (!binding?.query || !query.trim()) return [];

  try {
    const embed = await env.AI.run('@cf/baai/bge-base-en-v1.5', { text: query });
    const vector = (embed as { data?: number[][] })?.data?.[0];
    if (!vector?.length) return [];
    const index = (env as Record<string, unknown>)[collection] as typeof binding | undefined;
    const target = index ?? binding;
    const result = await target.query(vector, { topK: 5 });
    return (result.matches ?? [])
      .map((m) => m.metadata?.text ?? m.metadata?.content ?? '')
      .filter(Boolean);
  } catch (e) {
    console.warn('[workflow] vector memory query failed:', e);
    return [];
  }
}

export async function executeWorkflowGraph(
  params: ExecuteWorkflowParams,
): Promise<WorkflowExecutionResult> {
  const { c, bindingName, user, resolved, input, variables = {}, autoApproveHumanReview } = params;
  const { definition } = resolved;
  const attr = workflowAttribution(resolved);
  const userDO = getIdFromName(c, user.identifier, bindingName) as DurableObjectStub<UserDO>;

  const steps: ExecutionStepLog[] = [];
  const outputs = new Map<string, NodeOutput>();
  let totalCostVnd = 0;
  let globalStatus: WorkflowExecutionResult['status'] = 'completed';
  let finalOutput: unknown;

  if (!definition.nodes.length) {
    return {
      status: 'failed',
      workflowId: resolved.workflowId,
      workflowOwnerId: resolved.ownerId,
      output: { error: 'Workflow has no nodes' },
      steps: [],
      totalCostVnd: 0,
    };
  }

  const order = topologicalOrder(definition);
  const nodeById = new Map(definition.nodes.map((n) => [n.id, n]));

  const runContext: NodeOutput = {
    input: input ?? '',
    variables,
    workflowName: resolved.workflow.name,
  };

  for (const nodeId of order) {
    const node = nodeById.get(nodeId);
    if (!node) continue;

    const nodeInput = gatherInputs(nodeId, definition.edges, outputs);
    const started = Date.now();
    const log: ExecutionStepLog = {
      nodeId,
      nodeType: node.type,
      status: 'success',
      input: nodeInput,
    };

    try {
      const data = (node.data ?? {}) as Record<string, unknown>;
      let out: NodeOutput = {};

      switch (node.type) {
        case 'trigger': {
          out = {
            ...runContext,
            triggeredAt: Date.now(),
            text: input ?? '',
          };
          break;
        }

        case 'agent': {
          const endpoint = String(data.serviceEndpoint ?? data.endpoint ?? '').trim();
          if (!endpoint) throw new Error('Agent node missing serviceEndpoint');

          await ensureWalletBalance(userDO);
          const service = await resolveServiceByEndpoint(userDO, endpoint);
          const modelId = getModelForService(service);

          const userText =
            String(nodeInput.text ?? input ?? '') ||
            JSON.stringify(nodeInput);

          const memorySnippets = data.memoryCollection
            ? await queryVectorMemory(
                c.env,
                String(data.memoryCollection),
                userText,
              )
            : [];

          const systemParts = [
            String(data.systemPrompt ?? data.prompt ?? ''),
            resolved.workflow.description
              ? `Workflow: ${resolved.workflow.description}`
              : '',
            memorySnippets.length
              ? `Relevant memory:\n${memorySnippets.join('\n')}`
              : '',
            Array.isArray(data.tools) && data.tools.length
              ? `Available tools (configure in service): ${JSON.stringify(data.tools)}`
              : '',
          ].filter(Boolean);

          const messages = [
            ...(systemParts.length
              ? [{ role: 'system', content: systemParts.join('\n\n') }]
              : []),
            { role: 'user', content: userText },
          ];

          const maxTokens = Number(data.maxTokens ?? 1024) || 1024;
          const aiResponse = await runTextModel(c.env, modelId, messages, maxTokens);
          const text = extractTextFromAiResponse(aiResponse);

          const costVnd = await billAgentUsage(
            c.env,
            bindingName,
            userDO,
            user.identifier,
            service,
            {
              endpoint,
              aiResponse,
              userAgent: params.requestMeta?.userAgent,
              ipAddress: params.requestMeta?.ipAddress,
              workflowAttribution: attr,
            },
          );

          totalCostVnd += costVnd;
          log.costVnd = costVnd;
          out = { text, raw: aiResponse, endpoint };
          break;
        }

        case 'human_review': {
          if (!autoApproveHumanReview) {
            log.status = 'pending_human';
            log.output = {
              message: String(data.message ?? 'Awaiting human approval'),
              payload: nodeInput,
            };
            globalStatus = 'pending_human';
            steps.push({ ...log, durationMs: Date.now() - started });
            outputs.set(nodeId, log.output as NodeOutput);
            return {
              status: globalStatus,
              workflowId: resolved.workflowId,
              workflowOwnerId: resolved.ownerId,
              output: log.output,
              steps,
              totalCostVnd,
            };
          }
          out = { ...nodeInput, approved: true, approvedAt: Date.now() };
          break;
        }

        case 'flow': {
          out = { ...nodeInput, passthrough: true };
          break;
        }

        case 'core': {
          const op = String(data.operation ?? 'identity');
          if (op === 'set_variable' && data.key) {
            runContext.variables = {
              ...(runContext.variables as Record<string, unknown>),
              [String(data.key)]: data.value,
            };
          }
          out = { ...nodeInput, variables: runContext.variables };
          break;
        }

        case 'action_in_app': {
          out = {
            ...nodeInput,
            action: String(data.action ?? 'noop'),
            result: `Action "${data.action ?? 'noop'}" recorded (extensible)`,
          };
          break;
        }

        case 'data_transformation': {
          const mode = String(data.mode ?? 'pick_text');
          if (mode === 'json_parse' && typeof nodeInput.text === 'string') {
            try {
              out = { data: JSON.parse(nodeInput.text) };
            } catch {
              out = { data: nodeInput.text };
            }
          } else {
            out = {
              text: nodeInput.text ?? JSON.stringify(nodeInput),
              data: nodeInput,
            };
          }
          break;
        }

        default:
          out = { ...nodeInput };
      }

      log.output = out;
      outputs.set(nodeId, out);
      finalOutput = out;
    } catch (e) {
      log.status = 'error';
      log.error = e instanceof Error ? e.message : String(e);
      steps.push({ ...log, durationMs: Date.now() - started });
      return {
        status: 'failed',
        workflowId: resolved.workflowId,
        workflowOwnerId: resolved.ownerId,
        output: { error: log.error, lastNode: nodeId },
        steps,
        totalCostVnd,
      };
    }

    steps.push({ ...log, durationMs: Date.now() - started });
  }

  return {
    status: globalStatus,
    workflowId: resolved.workflowId,
    workflowOwnerId: resolved.ownerId,
    output: finalOutput,
    steps,
    totalCostVnd,
  };
}
