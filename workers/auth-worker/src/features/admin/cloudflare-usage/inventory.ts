export type ExpectedResource = {
  kind: string;
  id: string;
  name: string;
  notes: string[];
};

export const HUB_WRANGLER_FACTS = {
  systemConfigKvIds: ['e80315e1a3fb47e2959d645a15ac534a', '529353fcfe7641c9bcbd5dda5d01d5da'] as const,
  shardCount: 1000,
  d1RetentionDays: 96,
  observabilityUnsampled: true,
  webCpuMs: 300_000,
  workerNames: [
    'aiagents-hub-auth-worker',
    'aiagents-hub-trading-sto',
    'aiagents-hub-queue-worker',
    'aiagents-hub-consumer-worker',
    'aiagents-hub-d1tor2-cron',
  ] as const,
  aiGatewayId: 'unitoken',
};

export const EXPECTED_INVENTORY: ExpectedResource[] = [
  { kind: 'worker', id: 'aiagents-hub-auth-worker', name: 'aiagents-hub-auth-worker', notes: ['API + WS', 'api.aiagents-hub.vn'] },
  { kind: 'worker', id: 'aiagents-hub-trading-sto', name: 'aiagents-hub-trading-sto', notes: ['OpenNext web', 'cpu_ms = 300000'] },
  { kind: 'worker', id: 'aiagents-hub-queue-worker', name: 'aiagents-hub-queue-worker', notes: ['input-part-0 + DLQ'] },
  { kind: 'worker', id: 'aiagents-hub-consumer-worker', name: 'aiagents-hub-consumer-worker', notes: ['SHARD_COUNT = 1000'] },
  { kind: 'worker', id: 'aiagents-hub-d1tor2-cron', name: 'aiagents-hub-d1tor2-cron', notes: ['D1_RETENTION_DAYS = 96'] },
  { kind: 'd1', id: '1c4b5c9d-4125-44fc-b1c8-c47bd3898b54', name: 'aiagents-hub-db', notes: ['shared'] },
  { kind: 'r2', id: 'aiagents-hub-version-backup-bucket', name: 'aiagents-hub-version-backup-bucket', notes: [] },
  { kind: 'r2', id: 'aiagents-hub-ekyc-storage-bucket', name: 'aiagents-hub-ekyc-storage-bucket', notes: [] },
  { kind: 'r2', id: 'aiagents-hub-lakehouse', name: 'aiagents-hub-lakehouse', notes: ['Data Catalog / Iceberg'] },
  { kind: 'kv', id: 'dfbfc6ec8f75482bbf54854d86442e27', name: 'NONCE_KV', notes: ['auth'] },
  { kind: 'kv', id: 'e80315e1a3fb47e2959d645a15ac534a', name: 'SYSTEM_CONFIG_KV (auth)', notes: ['auth-worker'] },
  { kind: 'kv', id: '529353fcfe7641c9bcbd5dda5d01d5da', name: 'SYSTEM_CONFIG_KV (queue/d1tor2)', notes: ['second namespace'] },
  { kind: 'do', id: 'UserDO', name: 'UserDO', notes: ['SQLite', 'WebSocket hibernation'] },
  { kind: 'do', id: 'UserShardDO', name: 'UserShardDO', notes: ['SHARD_COUNT = 1000'] },
  { kind: 'do', id: 'BroadcastServiceDO', name: 'BroadcastServiceDO', notes: [] },
  { kind: 'queue', id: 'aiagents-hub-input-part-0', name: 'aiagents-hub-input-part-0', notes: [] },
  { kind: 'queue', id: 'aiagents-hub-error-queue-dlq', name: 'aiagents-hub-error-queue-dlq', notes: [] },
  { kind: 'queue', id: 'aiagents-hub-ws-broadcast-queue', name: 'aiagents-hub-ws-broadcast-queue', notes: [] },
  { kind: 'queue', id: 'aiagents-hub-ws-broadcast-dlq', name: 'aiagents-hub-ws-broadcast-dlq', notes: [] },
  { kind: 'queue', id: 'aiagents-hub-workflow-cron-queue', name: 'aiagents-hub-workflow-cron-queue', notes: [] },
  { kind: 'queue', id: 'aiagents-hub-workflow-cron-dlq', name: 'aiagents-hub-workflow-cron-dlq', notes: [] },
  { kind: 'vectorize', id: 'ask-ai-semantic', name: 'ask-ai-semantic', notes: [] },
  { kind: 'ai-gateway', id: 'unitoken', name: 'unitoken', notes: ['Workers AI gateway'] },
  { kind: 'images', id: 'IMAGES', name: 'IMAGES', notes: ['eKYC merge'] },
  { kind: 'analytics-engine', id: 'aiagents-hub-queue-analytics', name: 'aiagents-hub-queue-analytics', notes: [] },
];

export function reconcileInventory(
  found: Array<{ kind: string; id: string; name: string }>,
): import('./domain.js').InventoryItem[] {
  const foundKey = new Set(found.map((f) => `${f.kind}:${f.id}`));
  const foundByKindName = new Set(found.map((f) => `${f.kind}:${f.name}`));
  const expectedKeys = new Set(EXPECTED_INVENTORY.map((e) => `${e.kind}:${e.id}`));

  const rows: import('./domain.js').InventoryItem[] = EXPECTED_INVENTORY.map((e) => {
    const hit = foundKey.has(`${e.kind}:${e.id}`) || foundByKindName.has(`${e.kind}:${e.name}`);
    return {
      kind: e.kind,
      id: e.id,
      name: e.name,
      expected: true,
      found: hit,
      status: hit ? 'ok' : 'missing',
      notes: e.notes,
    };
  });

  for (const f of found) {
    const expected = expectedKeys.has(`${f.kind}:${f.id}`) || EXPECTED_INVENTORY.some((e) => e.kind === f.kind && e.name === f.name);
    if (expected) continue;
    rows.push({
      kind: f.kind,
      id: f.id,
      name: f.name,
      expected: false,
      found: true,
      status: 'orphan',
      notes: [],
    });
  }

  return rows;
}
