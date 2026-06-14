import type { NodeContext, NodeOutput } from '../types.js';

export async function executeTrigger(ctx: NodeContext): Promise<NodeOutput> {
  const data = (ctx.node.data ?? {}) as Record<string, unknown>;
  const triggerKind = String(data.triggerKind ?? 'manual');

  const base: NodeOutput = {
    ...ctx.runContext,
    triggeredAt: Date.now(),
    text: ctx.input ?? '',
    data: ctx.nodeInput.data,
    triggerKind,
  };

  if (triggerKind === 'form' && data.formKind === 'database') {
    const runContext = ctx.runContext as Record<string, unknown>;
    const merged = {
      ...base,
      formKind: 'database',
      dbId: runContext.dbId ?? data.databaseId ?? '',
      schemaName: runContext.schemaName ?? data.schemaName ?? 'public',
      tableName: runContext.tableName ?? '',
      connection: runContext.connection ?? {
        type: data.connectionType ?? 'd1',
        credentialKey: data.credentialKey ?? '',
      },
      limits: runContext.limits ?? {
        sampleRowLimit: data.sampleRowLimit ?? 10,
        sqlHistoryLimit: data.sqlHistoryLimit ?? 10,
      },
      executionIndex: runContext.executionIndex ?? 1,
      executionTotal: runContext.executionTotal ?? 1,
    };
    return merged;
  }

  return base;
}
