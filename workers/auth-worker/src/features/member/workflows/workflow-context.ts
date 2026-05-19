import { getIdFromName, executeUtils } from '../../../shared/utils.js';
import { UserDO } from '../../ws/infrastructure/UserDO.js';
import type { WorkflowDefinition } from './domain.js';
import { WorkflowDefinitionSchema } from './domain.js';

export interface ResolvedWorkflow {
  workflow: Record<string, unknown>;
  definition: WorkflowDefinition;
  ownerId: string;
  workflowId: number;
  isOwnedByUser: boolean;
}

export function parseWorkflowDefinition(raw: unknown): WorkflowDefinition {
  if (typeof raw === 'string') {
    try {
      return WorkflowDefinitionSchema.parse(JSON.parse(raw));
    } catch {
      return { nodes: [], edges: [] };
    }
  }
  try {
    return WorkflowDefinitionSchema.parse(raw);
  } catch {
    return { nodes: [], edges: [] };
  }
}

export async function resolveWorkflow(
  c: any,
  bindingName: string,
  userIdentifier: string,
  workflowId: number,
  ownerIdParam?: string,
): Promise<ResolvedWorkflow> {
  const binding = c.env[bindingName] as DurableObjectNamespace;
  const consumerOwnerId = binding.idFromName(userIdentifier).toString();

  if (ownerIdParam && ownerIdParam !== consumerOwnerId) {
    const db = c.env.D1DB;
    if (!db) throw new Error('D1 database binding not configured');
    const row = await db
      .prepare(
        `SELECT id, user_id, name, description, slug, definition, isShared, status
         FROM agent_workflows WHERE user_id = ? AND id = ? AND isShared = 1 LIMIT 1`,
      )
      .bind(ownerIdParam, workflowId)
      .first<Record<string, unknown>>();
    if (!row) throw new Error('Shared workflow not found');
    if (row.status !== 'published') throw new Error('Workflow is not published');

    const ownerDO = binding.get(binding.idFromString(ownerIdParam)) as DurableObjectStub<UserDO>;
    const rows = await executeUtils.executeDynamicAction(
      ownerDO,
      'select',
      { where: { field: 'id', operator: '=', value: workflowId } },
      'agent_workflows',
    );
    const wf = Array.isArray(rows) ? rows[0] : rows;
    if (!wf) throw new Error('Workflow not found');

    return {
      workflow: wf,
      definition: parseWorkflowDefinition(wf.definition),
      ownerId: ownerIdParam,
      workflowId,
      isOwnedByUser: false,
    };
  }

  const userDO = getIdFromName(c, userIdentifier, bindingName) as DurableObjectStub<UserDO>;
  const rows = await executeUtils.executeDynamicAction(
    userDO,
    'select',
    { where: { field: 'id', operator: '=', value: workflowId } },
    'agent_workflows',
  );
  const wf = Array.isArray(rows) ? rows[0] : rows;
  if (!wf) throw new Error('Workflow not found');

  return {
    workflow: wf,
    definition: parseWorkflowDefinition(wf.definition),
    ownerId: consumerOwnerId,
    workflowId,
    isOwnedByUser: true,
  };
}

export function workflowAttribution(resolved: ResolvedWorkflow) {
  if (resolved.isOwnedByUser) return undefined;
  return {
    workflowId: resolved.workflowId,
    workflowOwnerId: resolved.ownerId,
  };
}

export function findPrimaryAgentNode(definition: WorkflowDefinition) {
  const agents = definition.nodes.filter((n) => n.type === 'agent');
  const withEntry = agents.find((n) => (n.data as { chatEntry?: boolean })?.chatEntry);
  return withEntry ?? agents[0] ?? null;
}
