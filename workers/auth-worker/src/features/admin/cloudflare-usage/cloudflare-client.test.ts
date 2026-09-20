import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchGraphQlUsage } from './cloudflare-client.js';

type Rows = Array<Record<string, unknown>>;

const ROWS: Record<string, Rows> = {
  workersInvocationsAdaptive: [
    { sum: { requests: 1000, errors: 2, cpuTimeUs: 3_000_000 }, dimensions: { scriptName: 'auth-worker', datetimeHour: '2026-09-20T05:00:00Z' } },
  ],
  d1AnalyticsAdaptiveGroups: [{ sum: { rowsRead: 500, rowsWritten: 20 }, dimensions: { databaseId: 'db-1' } }],
  d1StorageAdaptiveGroups: [{ max: { databaseSizeBytes: 2_000_000_000 }, dimensions: { databaseId: 'db-1' } }],
  kvOperationsAdaptiveGroups: [{ sum: { requests: 40 }, dimensions: { actionType: 'read', namespaceId: 'ns-1' } }],
  kvStorageAdaptiveGroups: [{ max: { byteCount: 500_000_000 }, dimensions: { namespaceId: 'ns-1' } }],
  r2OperationsAdaptiveGroups: [{ sum: { requests: 7 }, dimensions: { actionType: 'PutObject', bucketName: 'lakehouse' } }],
  r2StorageAdaptiveGroups: [{ max: { payloadSize: 3_000_000_000 }, dimensions: { bucketName: 'lakehouse' } }],
  durableObjectsInvocationsAdaptiveGroups: [{ sum: { requests: 90 }, dimensions: { namespaceId: 'ns-do', scriptName: 'UserDO' } }],
  durableObjectsPeriodicGroups: [{ sum: { duration: 12.5, rowsRead: 300, rowsWritten: 30 }, dimensions: { namespaceId: 'ns-do' } }],
  durableObjectsSqlStorageGroups: [{ max: { storedBytes: 1_000_000_000 }, dimensions: { namespaceId: 'ns-do' } }],
  queueMessageOperationsAdaptiveGroups: [{ sum: { billableOperations: 60 }, dimensions: { queueId: 'q-1', actionType: 'WriteMessage' } }],
  vectorizeV2QueriesAdaptiveGroups: [{ sum: { queriedVectorDimensions: 4_000 }, dimensions: { indexName: 'docs' } }],
  vectorizeV2StorageAdaptiveGroups: [
    { max: { storedVectorDimensions: 900 }, dimensions: { indexName: 'docs' } },
    { max: { storedVectorDimensions: 1_100 }, dimensions: { indexName: 'docs' } },
  ],
  aiInferenceAdaptiveGroups: [{ sum: { totalNeurons: 12_320 }, dimensions: { modelId: '@cf/meta/llama-3.1-8b-instruct' } }],
  imagesUniqueTransformationsAccumulatedSinceStartOfMonth: [
    { date: '2026-09-19', transformations: 80 },
    { date: '2026-09-20', transformations: 120 },
  ],
  workersAnalyticsEngineAdaptiveGroups: [{ count: 150, dimensions: { dataset: 'usage' } }],
};

function nodeOf(query: string): string {
  const node = Object.keys(ROWS).find((name) => query.includes(`${name}(`));
  if (!node) throw new Error(`unexpected GraphQL node in query: ${query}`);
  return node;
}

function stubGraphql(failing: string[] = []): void {
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { query: string };
    const node = nodeOf(body.query);
    if (failing.includes(node)) {
      return new Response(JSON.stringify({ errors: [{ message: `unknown field ${node}` }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ data: { viewer: { accounts: [{ [node]: ROWS[node] }] } } }), { status: 200 });
  });
}

const START = new Date('2026-09-01T00:00:00Z');
const END = new Date('2026-10-01T00:00:00Z');
const NOW = new Date('2026-09-20T10:00:00Z');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchGraphQlUsage', () => {
  it('reads usage from the datasets the Cloudflare schema actually exposes', async () => {
    stubGraphql();
    const errors: string[] = [];
    const { usage, unreadableMetrics } = await fetchGraphQlUsage('token', 'acct', START, END, NOW, errors);

    expect(errors).toEqual([]);
    expect(usage['workers_ai.neurons'].mtd).toBe(12_320);
    expect(usage['workers.requests'].mtd).toBe(1000);
    expect(usage['workers.cpu_ms'].mtd).toBe(3000);
    expect(usage['vectorize.queried_dims'].mtd).toBe(4_000);
    expect(usage['vectorize.stored_dims'].mtd).toBe(1_100);
    expect(usage['images.unique_transformations'].mtd).toBe(120);
    expect(usage['do.duration_gb_s'].mtd).toBe(12.5);
    expect(usage['do.sqlite.rows_read'].mtd).toBe(300);
    expect(usage['queues.operations'].mtd).toBe(60);
    expect(usage['ae.datapoints_written'].mtd).toBe(150);
    expect(usage['r2.storage_gb'].mtd).toBe(3);
    expect(usage['kv.storage_gb'].mtd).toBe(0.5);
    expect(usage['d1.storage_gb'].mtd).toBe(2);
    expect(Object.keys(unreadableMetrics).sort()).toEqual([
      'pipelines.sink_parquet_gb',
      'pipelines.sql_gb',
      'workers.logs_events',
    ]);
  });

  it('marks only the metrics behind a failing query as unreadable', async () => {
    stubGraphql(['aiInferenceAdaptiveGroups']);
    const errors: string[] = [];
    const { usage, unreadableMetrics } = await fetchGraphQlUsage('token', 'acct', START, END, NOW, errors);

    expect(unreadableMetrics['workers_ai.neurons']).toContain('aiInferenceAdaptiveGroups');
    expect(unreadableMetrics['vectorize.queried_dims']).toBeUndefined();
    expect(usage['vectorize.queried_dims'].mtd).toBe(4_000);
    expect(errors.some((e) => e.startsWith('graphql:aiInferenceAdaptiveGroups'))).toBe(true);
  });
});
