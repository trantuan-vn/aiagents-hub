import type { WorkflowDefinition } from '../domain/domain.js';
import { executeWorkflowGraph } from '../engine/executor.js';
import type { ResolvedWorkflow } from '../execution/workflow-context.js';
import { listDatabaseTables } from '../nodes/tool/get-db-info.js';
import type { WorkflowTriggerRow } from './triggers.js';

export type FormDatabaseTriggerData = {
  triggerKind: 'form';
  formKind: 'database';
  credentialKey?: string;
  connectionType?: string;
  databaseId?: string;
  schemaName?: string;
  executionMode?: 'once' | 'per_table';
  tableFilter?: string;
  sampleRowLimit?: number;
  sqlHistoryLimit?: number;
};

export function findFormDatabaseTriggerNode(
  definition: WorkflowDefinition,
): WorkflowDefinition['nodes'][number] | undefined {
  return definition.nodes.find((n) => {
    if (n.type !== 'trigger') return false;
    const data = (n.data ?? {}) as Record<string, unknown>;
    return data.triggerKind === 'form' && data.formKind === 'database';
  });
}

export function buildFormTriggerOutput(
  data: FormDatabaseTriggerData,
  tableName: string,
  executionIndex: number,
  executionTotal: number,
): Record<string, unknown> {
  return {
    triggerKind: 'form',
    formKind: 'database',
    dbId: data.databaseId ?? '',
    schemaName: data.schemaName ?? 'public',
    tableName,
    connection: {
      type: data.connectionType ?? 'd1',
      credentialKey: data.credentialKey ?? '',
    },
    limits: {
      sampleRowLimit: data.sampleRowLimit ?? 10,
      sqlHistoryLimit: data.sqlHistoryLimit ?? 10,
    },
    executionIndex,
    executionTotal,
  };
}

export type FormTriggerRunResult = {
  status: 'completed' | 'partial' | 'failed';
  executions: Array<{
    tableName: string;
    status: string;
    executionKey?: string;
    error?: string;
  }>;
};

/** Fan-out: one workflow execution per database table. */
export async function runFormDatabaseTrigger(params: {
  env: Env;
  bindingName: string;
  user: { identifier: string };
  resolved: ResolvedWorkflow;
  trigger: WorkflowTriggerRow;
  triggerNode: WorkflowDefinition['nodes'][number];
  autoApproveHumanReview?: boolean;
}): Promise<FormTriggerRunResult> {
  const data = (params.triggerNode.data ?? {}) as FormDatabaseTriggerData;
  const connection = {
    type: data.connectionType ?? 'd1',
    credentialKey: data.credentialKey,
    databaseId: data.databaseId,
  };

  const tables = await listDatabaseTables(
    params.env,
    connection,
    data.schemaName ?? 'public',
    data.tableFilter ?? '*',
  );

  if (!tables.length) {
    return { status: 'failed', executions: [{ tableName: '', status: 'failed', error: 'No tables found' }] };
  }

  const mode = data.executionMode ?? 'per_table';
  const targetTables = mode === 'once' ? [tables[0]!] : tables;
  const results: FormTriggerRunResult['executions'] = [];

  for (let i = 0; i < targetTables.length; i += 1) {
    const tableName = targetTables[i]!;
    const output = buildFormTriggerOutput(data, tableName, i + 1, targetTables.length);

    try {
      const result = await executeWorkflowGraph({
        c: { env: params.env } as any,
        bindingName: params.bindingName,
        user: params.user,
        resolved: params.resolved,
        input: JSON.stringify(output),
        autoApproveHumanReview: params.autoApproveHumanReview ?? false,
        runnerDoIdString: params.trigger.ownerId,
        requestMeta: { userAgent: 'trigger:form' },
        entryNodeIds: [params.triggerNode.id],
        runContextOverride: output,
      });

      results.push({
        tableName,
        status: result.status,
        executionKey: result.executionKey,
        error: result.status === 'failed' ? String((result.output as Record<string, unknown>)?.error ?? 'failed') : undefined,
      });
    } catch (e) {
      results.push({
        tableName,
        status: 'failed',
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const failed = results.filter((r) => r.status === 'failed').length;
  const status =
    failed === 0 ? 'completed' : failed === results.length ? 'failed' : 'partial';

  return { status, executions: results };
}
