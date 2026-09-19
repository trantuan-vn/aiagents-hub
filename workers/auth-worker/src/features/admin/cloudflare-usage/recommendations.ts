import type { InventoryItem, Recommendation, UsageMetricRow, WorkersPlanId } from './domain.js';
import { HUB_WRANGLER_FACTS } from './inventory.js';

const SEVERITY_WEIGHT = { critical: 4, high: 3, medium: 2, low: 1 } as const;
const EFFORT_WEIGHT = { S: 1, M: 2, L: 3 } as const;
const CONFIDENCE_WEIGHT = { low: 0.6, medium: 0.85, high: 1 } as const;

function metric(rows: UsageMetricRow[], id: string): UsageMetricRow | undefined {
  return rows.find((r) => r.metricId === id);
}

function hot(row: UsageMetricRow | undefined): boolean {
  if (!row || row.status === 'unavailable') return false;
  return row.status === 'watch' || row.status === 'projected_over' || row.status === 'over' || row.status === 'hard_stop_today';
}

function savedFrom(row: UsageMetricRow | undefined, fallbackMax = 0): { min: number; max: number } {
  const max = Math.max(0, row?.overageUsdProjected ?? fallbackMax);
  return { min: Math.round(max * 0.3 * 100) / 100, max: Math.round(max * 100) / 100 };
}

function score(
  rec: Omit<Recommendation, 'priorityScore' | 'status'> & { confidence?: 'low' | 'medium' | 'high' },
): Recommendation {
  const conf = rec.confidence ?? 'medium';
  const mid = (rec.usdSavedPerMonth.min + rec.usdSavedPerMonth.max) / 2;
  const priorityScore =
    (mid + 1) * CONFIDENCE_WEIGHT[conf] * SEVERITY_WEIGHT[rec.severity] / EFFORT_WEIGHT[rec.effort];
  return { ...rec, status: 'advisory', priorityScore };
}

export type RecommendationInput = {
  planId: WorkersPlanId;
  metrics: UsageMetricRow[];
  inventory: InventoryItem[];
};

export function buildRecommendations(input: RecommendationInput): Recommendation[] {
  const { planId, metrics, inventory } = input;
  const out: Recommendation[] = [];
  const logs = metric(metrics, 'workers.logs_events');
  const kvReads = metric(metrics, 'kv.reads');
  const d1Storage = metric(metrics, 'd1.storage_gb');
  const d1Read = metric(metrics, 'd1.rows_read');
  const doDur = metric(metrics, 'do.duration_gb_s');
  const neurons = metric(metrics, 'workers_ai.neurons');
  const vectorize = metric(metrics, 'vectorize.queried_dims');

  if (planId === 'workers_free') {
    out.push(
      score({
        id: 'plan.free_hardstop',
        title: 'Upgrade to Workers Paid before daily hard-stops',
        severity: 'critical',
        because:
          'This Hub account is on Workers Free. D1/KV/Queue daily caps fail the API instead of billing. Production aiagents-hub should be on Workers Paid ($5/mo) before traffic grows.',
        actions: [
          'Cloudflare Dashboard → Workers & Pages → paid plan',
          'Re-open this screen to reload included allotments',
        ],
        usdSavedPerMonth: { min: 0, max: 0 },
        effort: 'S',
      }),
    );
  }

  const logsHot = Boolean(logs && (logs.status === 'projected_over' || logs.status === 'over' || (logs.pctOfIncluded ?? 0) >= 50));
  if (HUB_WRANGLER_FACTS.observabilityUnsampled && logsHot) {
    out.push(
      score({
        id: 'obs.unsampled',
        title: 'Sample Workers Logs on queue/cron workers',
        severity: 'high',
        metricId: 'workers.logs_events',
        because: `All 5 Hub workers enable observability with no head_sampling_rate. Logs are at ${logs?.pctOfIncluded ?? 0}% of included (${logs?.usageMtd ?? 0} events MTD).`,
        actions: [
          'Set observability.head_sampling_rate 0.01–0.1 on queue-worker, consumer-worker, d1tor2-cron',
          'Keep 100% on auth-worker while debugging',
        ],
        usdSavedPerMonth: savedFrom(logs),
        effort: 'S',
        confidence: logs?.confidence,
      }),
    );
  }

  if (HUB_WRANGLER_FACTS.systemConfigKvIds.length >= 2) {
    out.push(
      score({
        id: 'kv.split_system_config',
        title: 'Merge the two SYSTEM_CONFIG_KV namespaces',
        severity: 'medium',
        metricId: 'kv.storage_gb',
        because:
          'auth-worker uses SYSTEM_CONFIG_KV e80315e1… while queue-worker and d1tor2-cron use 529353fc…. Storage and ops are doubled and config can drift.',
        actions: [
          'Point queue-worker and d1tor2-cron wrangler KV id at the auth-worker namespace',
          'Copy keys once, then delete the unused namespace',
        ],
        usdSavedPerMonth: { min: 0.15, max: 0.5 },
        effort: 'M',
      }),
    );
  }

  if (hot(d1Storage) || hot(d1Read)) {
    out.push(
      score({
        id: 'd1.retention_96',
        title: 'Shorten D1 retention below 96 days',
        severity: 'medium',
        metricId: hot(d1Storage) ? 'd1.storage_gb' : 'd1.rows_read',
        because: `d1tor2-cron keeps D1_RETENTION_DAYS = 96. D1 storage is ${d1Storage?.usageMtd ?? 0} GB-month and rows read ${d1Read?.pctOfIncluded ?? 0}% of included.`,
        actions: [
          'Lower D1_RETENTION_DAYS to 30–45 once lakehouse reads are trusted',
          'Index created_at on large scan tables such as service_usages',
        ],
        usdSavedPerMonth: savedFrom(hot(d1Storage) ? d1Storage : d1Read),
        effort: 'M',
        confidence: d1Storage?.confidence ?? d1Read?.confidence,
      }),
    );
  }

  if (hot(doDur)) {
    out.push(
      score({
        id: 'do.ws_duration',
        title: 'Confirm Durable Object WebSocket hibernation',
        severity: 'high',
        metricId: 'do.duration_gb_s',
        because: `DO duration is ${doDur?.pctOfIncluded ?? 0}% of included (${doDur?.usageMtd ?? 0} GB-s). Open sockets on UserDO/UserShardDO bill wall-clock until hibernation.`,
        actions: [
          'Verify webSocketMessage does not hold I/O after the handler returns',
          'Use setWebSocketAutoResponse for pings so idle objects can hibernate',
        ],
        usdSavedPerMonth: savedFrom(doDur),
        effort: 'M',
        confidence: doDur?.confidence,
      }),
    );
  }

  const neuronsToday = neurons?.usageToday ?? 0;
  if (neurons && neuronsToday >= 8_000) {
    out.push(
      score({
        id: 'ai.neurons_daily',
        title: 'Workers AI is near the daily 10k neuron allotment',
        severity: 'high',
        metricId: 'workers_ai.neurons',
        because: `Gateway unitoken already retries capacity errors 3 times — retries consume neurons. Today is at ${neuronsToday} / 10,000 neurons.`,
        actions: [
          'Enable AI Gateway cache on unitoken for embeddings',
          'Keep 3036 (daily cap) as non-retryable — already in workers-ai.ts',
          'Prefer tiny models for RAG embed',
        ],
        usdSavedPerMonth: savedFrom(neurons),
        effort: 'S',
        confidence: neurons.confidence,
      }),
    );
  }

  if (hot(kvReads)) {
    out.push(
      score({
        id: 'kv.hot_config_reads',
        title: 'Cache SYSTEM_CONFIG_KV on the hot path',
        severity: 'medium',
        metricId: 'kv.reads',
        because: `KV reads are ${kvReads?.pctOfIncluded ?? 0}% of included. Royalty, FX, and queue config read SYSTEM_CONFIG_KV per request.`,
        actions: ['Cache parsed system config in the isolate for 30–60s'],
        usdSavedPerMonth: savedFrom(kvReads),
        effort: 'S',
        confidence: kvReads?.confidence,
      }),
    );
  }

  const queriedPct = vectorize?.pctOfIncluded;
  if (vectorize && queriedPct != null && queriedPct <= 20) {
    out.push(
      score({
        id: 'vectorize.small',
        title: 'Vectorize usage is well within included',
        severity: 'low',
        metricId: 'vectorize.queried_dims',
        because: `ask-ai-semantic is at ${queriedPct}% of included queried dimensions. No index change is warranted.`,
        actions: ['Leave the Vectorize index as-is'],
        usdSavedPerMonth: { min: 0, max: 0 },
        effort: 'S',
        confidence: vectorize.confidence,
      }),
    );
  }

  void inventory;
  return out.sort((a, b) => b.priorityScore - a.priorityScore);
}
