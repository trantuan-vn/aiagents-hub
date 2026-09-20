import type { CloudflarePlans, InventoryItem, Recommendation, UsageMetricRow, WorkersPlanId } from './domain.js';
import { HUB_WRANGLER_FACTS } from './inventory.js';

const SEVERITY_WEIGHT = { critical: 4, high: 3, medium: 2, low: 1 } as const;
const EFFORT_WEIGHT = { S: 1, M: 2, L: 3 } as const;
const CONFIDENCE_WEIGHT = { low: 0.6, medium: 0.85, high: 1 } as const;
const PAID_ZONE_PLANS = new Set(['pro', 'pro_plus', 'business']);

function metric(rows: UsageMetricRow[], id: string): UsageMetricRow | undefined {
  return rows.find((r) => r.metricId === id);
}

function hot(row: UsageMetricRow | undefined): boolean {
  if (!row || row.status === 'unavailable') return false;
  return row.status === 'watch' || row.status === 'projected_over' || row.status === 'over' || row.status === 'hard_stop_today';
}

function projectedOrOver(row: UsageMetricRow | undefined): boolean {
  if (!row || row.status === 'unavailable') return false;
  return row.status === 'projected_over' || row.status === 'over' || row.status === 'hard_stop_today';
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

function breakdownShare(row: UsageMetricRow | undefined, needles: string[]): number {
  if (!row || row.usageMtd <= 0) return 0;
  const lowered = needles.map((n) => n.toLowerCase());
  const hit = (row.breakdown ?? []).filter((b) => {
    const key = `${b.key} ${b.label}`.toLowerCase();
    return lowered.some((n) => key.includes(n));
  });
  return hit.reduce((s, b) => s + b.usage, 0) / row.usageMtd;
}

function cronSpikeAt16Utc(hours?: Record<number, number>): boolean {
  if (!hours) return false;
  const h16 = hours[16] ?? 0;
  if (h16 <= 0) return false;
  const others = Object.entries(hours)
    .filter(([hour]) => Number(hour) !== 16)
    .map(([, value]) => value);
  if (!others.length) return true;
  const avg = others.reduce((a, b) => a + b, 0) / others.length;
  return h16 >= Math.max(avg * 3, 1);
}

export type RecommendationInput = {
  planId: WorkersPlanId;
  metrics: UsageMetricRow[];
  inventory: InventoryItem[];
  plans?: CloudflarePlans;
  totalUsdProjected?: number;
  cogsInfraUsdEst30d?: number;
  cronCpuByUtcHour?: Record<number, number>;
};

export function buildRecommendations(input: RecommendationInput): Recommendation[] {
  const { planId, metrics, inventory, plans, totalUsdProjected, cogsInfraUsdEst30d, cronCpuByUtcHour } = input;
  const out: Recommendation[] = [];
  const logs = metric(metrics, 'workers.logs_events');
  const kvReads = metric(metrics, 'kv.reads');
  const d1Storage = metric(metrics, 'd1.storage_gb');
  const d1Read = metric(metrics, 'd1.rows_read');
  const d1Written = metric(metrics, 'd1.rows_written');
  const doDur = metric(metrics, 'do.duration_gb_s');
  const neurons = metric(metrics, 'workers_ai.neurons');
  const vectorize = metric(metrics, 'vectorize.queried_dims');
  const r2Storage = metric(metrics, 'r2.storage_gb');
  const r2ClassA = metric(metrics, 'r2.class_a');
  const queues = metric(metrics, 'queues.operations');
  const ae = metric(metrics, 'ae.datapoints_written');
  const cpu = metric(metrics, 'workers.cpu_ms');
  const requests = metric(metrics, 'workers.requests');
  const images = metric(metrics, 'images.unique_transformations');
  const pipelinesSql = metric(metrics, 'pipelines.sql_gb');
  const pipelinesSink = metric(metrics, 'pipelines.sink_parquet_gb');

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
    const [authKvId, queueKvId] = HUB_WRANGLER_FACTS.systemConfigKvIds;
    out.push(
      score({
        id: 'kv.split_system_config',
        title: 'System Config never reaches queue-worker or d1tor2',
        severity: 'high',
        because:
          `Admin System Config writes key aiagents-hub-system-config to auth-worker KV ${authKvId.slice(0, 8)}…, but queue-worker and d1tor2-cron read that same key from ${queueKvId.slice(0, 8)}…. BATCH_SIZE / D1_RETENTION_DAYS from the admin screen stay on wrangler defaults. This is a config-routing bug, not a $0.50 storage merge.`,
        actions: [
          `Point queue-worker and d1tor2-cron wrangler SYSTEM_CONFIG_KV id to ${authKvId} (auth)`,
          'Deploy those two workers, then delete namespace 529353fc… — do not copy it onto auth (auth is the source of truth)',
        ],
        usdSavedPerMonth: { min: 0, max: 0 },
        effort: 'M',
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

  const written = Math.max(1, d1Written?.usageMtd ?? 0);
  const readWriteRatio = (d1Read?.usageMtd ?? 0) / written;
  if (d1Read && d1Read.usageMtd > 0 && readWriteRatio > 100) {
    out.push(
      score({
        id: 'd1.full_scan',
        title: 'D1 reads look like unindexed full scans',
        severity: 'high',
        metricId: 'd1.rows_read',
        because: `Rows read / rows written is ${readWriteRatio.toFixed(0)}× (${d1Read.usageMtd} / ${d1Written?.usageMtd ?? 0}). That usually means queries without an index, not organic writes.`,
        actions: [
          'Check Contribution scan and queue sync tables for SELECT without created_at / id indexes',
          'Do not run EXPLAIN automatically from this screen',
        ],
        usdSavedPerMonth: savedFrom(d1Read),
        effort: 'M',
        confidence: d1Read.confidence,
      }),
    );
  }

  const lakehouseShare = Math.max(breakdownShare(r2Storage, ['lakehouse']), breakdownShare(r2ClassA, ['lakehouse']));
  if (projectedOrOver(r2Storage) && lakehouseShare >= 0.5) {
    out.push(
      score({
        id: 'r2.lakehouse_standard',
        title: 'Move cold lakehouse objects to Infrequent Access',
        severity: 'medium',
        metricId: 'r2.storage_gb',
        because: `R2 storage is ${r2Storage?.status} and lakehouse is ${(lakehouseShare * 100).toFixed(0)}% of measured storage/ops. Standard storage on archive objects is the usual overage.`,
        actions: [
          'Lifecycle aiagents-hub-lakehouse and version-backup to Infrequent Access after 30 days',
          'Do not put eKYC on Infrequent Access — that path is hot',
        ],
        usdSavedPerMonth: savedFrom(r2Storage),
        effort: 'M',
        confidence: r2Storage?.confidence,
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

  const shardShare = breakdownShare(doDur, ['usersharddo', 'user-shard']);
  if (doDur?.status === 'over' && shardShare >= 0.5) {
    out.push(
      score({
        id: 'do.shard_1000',
        title: 'UserShardDO duration looks like pre-warm, not hibernation',
        severity: 'high',
        metricId: 'do.duration_gb_s',
        because: `DO duration is over included and UserShardDO is ${(shardShare * 100).toFixed(0)}% of duration. SHARD_COUNT = 1000 is cheap only when idle objects hibernate.`,
        actions: [
          'Check alarms / pre-warm that keep shards alive',
          'Do not lower SHARD_COUNT while duration is low — only when shards stay billed idle',
        ],
        usdSavedPerMonth: savedFrom(doDur),
        effort: 'L',
        confidence: doDur.confidence,
      }),
    );
  }

  if (hot(queues)) {
    out.push(
      score({
        id: 'queue.retry_amplify',
        title: 'Queue retries are amplifying billable operations',
        severity: 'medium',
        metricId: 'queues.operations',
        because: `Queue operations are ${queues?.pctOfIncluded ?? 0}% of included. Cloudflare bills ~3 ops/message; retries and DLQ multiply that.`,
        actions: [
          'Raise max_batch_size where handlers are idempotent',
          'Keep DLQ max_retries at 1 (already the Hub default)',
        ],
        usdSavedPerMonth: savedFrom(queues),
        effort: 'S',
        confidence: queues?.confidence,
      }),
    );
  }

  const aePct = ae?.pctOfIncluded ?? 0;
  const aeToday = ae?.usageToday ?? 0;
  if (ae && (aePct >= 80 || ae.status === 'over' || ae.status === 'hard_stop_today' || (ae.includedPeriod === 'day' && ae.included > 0 && aeToday / ae.included >= 0.8))) {
    out.push(
      score({
        id: 'queue.ae_write',
        title: 'Analytics Engine writes are near the daily cap',
        severity: 'medium',
        metricId: 'ae.datapoints_written',
        because: `AE datapoints are at ${aePct}% of included (today ${aeToday}). Queue workers call writeDataPoint per message.`,
        actions: ['Raise AE_BATCH_SIZE or sample writeDataPoint instead of one point per message'],
        usdSavedPerMonth: savedFrom(ae),
        effort: 'S',
        confidence: ae.confidence,
      }),
    );
  }

  const webShare = breakdownShare(cpu, ['trading-sto']);
  if (projectedOrOver(cpu) && webShare >= 0.4) {
    out.push(
      score({
        id: 'cpu.web_300s',
        title: 'OpenNext web CPU is driving Workers CPU overage',
        severity: 'high',
        metricId: 'workers.cpu_ms',
        because: `workers.cpu_ms is ${cpu?.status} and aiagents-hub-trading-sto is ${(webShare * 100).toFixed(0)}% of CPU. wrangler sets cpu_ms = 300000 on OpenNext.`,
        actions: [
          'Split heavy SSR; cache HTML where it is public',
          'Keep static assets off the dynamic Worker ($0 on R2/assets)',
        ],
        usdSavedPerMonth: savedFrom(cpu),
        effort: 'M',
        confidence: cpu?.confidence,
      }),
    );
  }

  const cronShare = breakdownShare(cpu, ['d1tor2']);
  const cronSpike = cronSpikeAt16Utc(cronCpuByUtcHour);
  if ((projectedOrOver(cpu) || hot(cpu)) && (cronSpike || cronShare >= 0.15)) {
    out.push(
      score({
        id: 'cpu.cron_d1tor2',
        title: 'd1tor2-cron CPU spikes at 16:59 UTC',
        severity: 'medium',
        metricId: 'workers.cpu_ms',
        because: cronSpike
          ? `CPU for aiagents-hub-d1tor2-cron spikes in hour 16 UTC (cron 59 16 * * *). Pipeline concurrency is 5.`
          : `aiagents-hub-d1tor2-cron is ${(cronShare * 100).toFixed(0)}% of Workers CPU. Cron is 59 16 UTC with PIPELINE_CONCURRENCY_LIMIT = 5.`,
        actions: ['Lower PIPELINE_CONCURRENCY_LIMIT if archive latency is acceptable'],
        usdSavedPerMonth: savedFrom(cpu),
        effort: 'S',
        confidence: cpu?.confidence,
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

  const neuronOverage = Math.max(neurons?.overageUsdNow ?? 0, neurons?.overageUsdProjected ?? 0);
  if (neurons && neuronOverage > 0) {
    out.push(
      score({
        id: 'ai.gateway_cache',
        title: 'Enable AI Gateway cache on unitoken',
        severity: 'medium',
        metricId: 'workers_ai.neurons',
        because: `Workers AI overage is $${neuronOverage.toFixed(2)} this period. Repeated embeddings through gateway unitoken should hit provider cache.`,
        actions: ['Turn on cache for the unitoken AI Gateway (embed / repeated prompts)'],
        usdSavedPerMonth: savedFrom(neurons),
        effort: 'S',
        confidence: neurons.confidence,
      }),
    );
  }

  if (hot(images)) {
    out.push(
      score({
        id: 'images.ekyc',
        title: 'eKYC image transformations are approaching included',
        severity: 'medium',
        metricId: 'images.unique_transformations',
        because: `Images unique transformations are ${images?.pctOfIncluded ?? 0}% of included. eKYC merge bills unique transformations, not stored files.`,
        actions: [
          'Avoid re-transforming the same hash',
          'Store merged output on R2 and reuse it',
        ],
        usdSavedPerMonth: savedFrom(images),
        effort: 'S',
        confidence: images?.confidence,
      }),
    );
  }

  const pipelineRow = projectedOrOver(pipelinesSql) ? pipelinesSql : projectedOrOver(pipelinesSink) ? pipelinesSink : undefined;
  if (pipelineRow) {
    out.push(
      score({
        id: 'pipelines.unfiltered',
        title: 'Filter Pipelines SQL before the Iceberg sink',
        severity: 'medium',
        metricId: pipelineRow.metricId,
        because: `${pipelineRow.metricId} is ${pipelineRow.status} (${pipelineRow.usageMtd} ${pipelineRow.unit}). Ingress stream is $0; SQL/sink GB is $0.06/GB.`,
        actions: ['Push filters earlier in the SQL so unused columns/rows never reach Iceberg'],
        usdSavedPerMonth: savedFrom(pipelineRow),
        effort: 'M',
        confidence: pipelineRow.confidence,
      }),
    );
  }

  const authShare = breakdownShare(requests, ['auth-worker']);
  if (projectedOrOver(requests) && authShare >= 0.4) {
    out.push(
      score({
        id: 'workers.requests_auth',
        title: 'auth-worker requests are driving Workers request overage',
        severity: 'medium',
        metricId: 'workers.requests',
        because: `workers.requests is ${requests?.status} and auth-worker is ${(authShare * 100).toFixed(0)}% of requests. WS Upgrade is 1 request; service bindings do not add another.`,
        actions: [
          'Cache public GET responses where safe',
          'Do not route static assets through the Worker',
          'Keep queue traffic on service bindings',
        ],
        usdSavedPerMonth: savedFrom(requests),
        effort: 'M',
        confidence: requests?.confidence,
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

  const paidZones = (plans?.zones ?? []).filter((z) => PAID_ZONE_PLANS.has(z.planId));
  if (paidZones.length > 0) {
    const names = paidZones.map((z) => `${z.zoneName} (${z.publicName})`).join(', ');
    out.push(
      score({
        id: 'zone.paid_unused',
        title: 'Zone plan may be unused if traffic is almost all Workers',
        severity: 'low',
        because: `${names} is a paid zone plan while Hub traffic is Workers. WAF/Bot add-ons only pay off if they are actually used.`,
        actions: [
          'Confirm DNS/SSL/WAF need the paid zone plan',
          'Do not auto-downgrade — a person must check',
        ],
        usdSavedPerMonth: {
          min: 0,
          max: Math.round(paidZones.reduce((s, z) => s + z.subscriptionUsdPerMonth, 0) * 100) / 100,
        },
        effort: 'L',
        confidence: 'low',
      }),
    );
  }

  if (
    typeof totalUsdProjected === 'number' &&
    totalUsdProjected > 0 &&
    typeof cogsInfraUsdEst30d === 'number' &&
    cogsInfraUsdEst30d > 0
  ) {
    const ratio = totalUsdProjected / cogsInfraUsdEst30d;
    if (ratio > 2 || ratio < 0.5) {
      out.push(
        score({
          id: 'infra_buffer.recalibrate',
          title: 'infra_buffer looks off versus measured Cloudflare COGS',
          severity: 'medium',
          because: `Projected Cloudflare COGS is $${totalUsdProjected.toFixed(2)} this period vs $${cogsInfraUsdEst30d.toFixed(2)} sum(cogsInfraUsdEst) over 30 days (${ratio.toFixed(2)}×).`,
          actions: [
            'Open Contribution and review infra_buffer',
            'Do not auto-change the buffer from this screen',
          ],
          usdSavedPerMonth: { min: 0, max: 0 },
          effort: 'S',
        }),
      );
    }
  }

  void inventory;
  return out.sort((a, b) => b.priorityScore - a.priorityScore);
}
