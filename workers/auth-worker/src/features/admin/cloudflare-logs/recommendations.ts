import type { ErrorGroup, StabilityRecommendation, WorkerHealth } from './domain.js';
import { RUNBOOKS, matchRunbook } from './domain.js';

const SEVERITY_WEIGHT: Record<string, number> = { critical: 8, high: 4, medium: 2, low: 1 };
const EFFORT_WEIGHT: Record<string, number> = { S: 1, M: 2, L: 3 };

function recencyWeight(lastSeenIso: string, now = Date.now()): number {
  const ageH = Math.max(0, (now - Date.parse(lastSeenIso)) / 3_600_000);
  if (ageH < 1) return 4;
  if (ageH < 24) return 2;
  return 1;
}

function score(severity: string, lastSeen: string, volume: number, effort: 'S' | 'M' | 'L'): number {
  return ((SEVERITY_WEIGHT[severity] ?? 1) * recencyWeight(lastSeen) * Math.log10(Math.max(volume, 1) + 1)) / (EFFORT_WEIGHT[effort] ?? 2);
}

export function buildStabilityRecommendations(groups: ErrorGroup[], workers: WorkerHealth[]): StabilityRecommendation[] {
  const out: StabilityRecommendation[] = [];
  const open = groups.filter((g) => g.status === 'new' || g.status === 'ack' || g.status === 'investigating');

  for (const w of workers) {
    if ((w.errorRatePct ?? 0) >= 2) {
      out.push({
        id: `stab.error_rate:${w.scriptName}`,
        title: `${w.scriptName} error rate ≥ 2%`,
        because: `Observability error rate is ${(w.errorRatePct ?? 0).toFixed(2)}% (${w.observabilityErrors ?? w.graphqlErrors}/${w.observabilityEvents ?? w.requests}). GraphQL invocation exceptions: ${w.graphqlErrors}. Treat as incident — do not wait for each inbox row.`,
        actions: ['Inspect inbox for this script', 'Open live invocations for 5xx / exception'],
        files: [],
        effort: 'M',
        severity: 'critical',
        status: 'advisory',
        priorityScore: 40,
      });
    }
  }

  for (const g of open) {
    const rb = matchRunbook(g) ?? RUNBOOKS.find((r) => r.id === g.runbookId) ?? null;
    const hay = `${g.event ?? ''} ${g.title} ${g.runbookId ?? ''}`.toLowerCase();

    if (hay.includes('exceededcpu') || hay.includes('exceededmemory')) {
      out.push({
        id: `stab.cpu_exceeded:${g.fingerprint}`,
        fingerprint: g.fingerprint,
        title: 'Worker exceeded CPU or memory',
        because: `${g.scriptName} — ${g.count24h} in 24h, last ${g.lastSeen}.`,
        actions: ['Reduce CPU on the hot path', 'Check OpenNext cpu_ms, DO WebSocket I/O, d1tor2 concurrency'],
        files: rb?.files ?? ['workers/web/wrangler.toml'],
        effort: 'M',
        severity: 'critical',
        status: 'advisory',
        priorityScore: score('critical', g.lastSeen, g.count24h, 'M'),
      });
    }

    if (g.severity === 'high' && g.status === 'new' && g.count24h >= 3) {
      out.push({
        id: `stab.exception_open:${g.fingerprint}`,
        fingerprint: g.fingerprint,
        title: g.title,
        because: `${g.count24h} occurrences in 24h on ${g.scriptName}${g.event ? ` (${g.event})` : ''}. Status is still new.`,
        actions: rb?.checks ?? ['Ack while investigating', 'Open live invocation if still within 7 days'],
        files: rb?.files ?? [],
        effort: 'M',
        severity: g.severity,
        status: 'advisory',
        priorityScore: score(g.severity, g.lastSeen, g.count24h, 'M'),
      });
    }

    if (g.count1h >= 3 && (hay.includes('http_5') || /\b5\d\d\b/.test(g.title))) {
      out.push({
        id: `stab.http5xx_hot:${g.fingerprint}`,
        fingerprint: g.fingerprint,
        title: 'Hot HTTP 5xx path',
        because: `${g.scriptName} ${g.event ?? g.title} — ${g.count1h} in 1h, ${g.count24h} in 24h.`,
        actions: ['Open a live invocation for this fingerprint', 'Confirm handler vs origin failure'],
        files: rb?.files ?? [],
        effort: 'S',
        severity: 'high',
        status: 'advisory',
        priorityScore: score('high', g.lastSeen, g.count1h, 'S'),
      });
    }

    if (g.runbookId === 'cron.pipeline' || g.scriptName === 'aiagents-hub-d1tor2-cron' || hay.includes('cron.pipeline')) {
      out.push({
        id: `stab.cron_fail:${g.fingerprint}`,
        fingerprint: g.fingerprint,
        title: 'Archive cron failed',
        because: `d1tor2/cron error last ${g.lastSeen}. Lakehouse and billing van depend on a green run.`,
        actions: rb?.checks ?? ['Inspect pipeline-manager excerpt', 'Fix before next 16:59 UTC run'],
        files: rb?.files ?? ['workers/d1tor2-cron/src/pipelines/pipeline-manager.ts'],
        effort: 'M',
        severity: 'critical',
        status: 'advisory',
        priorityScore: score('critical', g.lastSeen, g.count24h, 'M'),
      });
    }

    if (g.runbookId === 'queue.dlq' || hay.includes('dlq')) {
      out.push({
        id: `stab.dlq:${g.fingerprint}`,
        fingerprint: g.fingerprint,
        title: 'Dead-letter queue activity',
        because: `DLQ fingerprint ${g.fingerprint} — ${g.count24h} in 24h. Do not raise retries.`,
        actions: ['Identify poison message type', 'Keep DLQ max_retries at 1'],
        files: ['workers/queue-worker/wrangler.jsonc'],
        effort: 'S',
        severity: 'critical',
        status: 'advisory',
        priorityScore: score('critical', g.lastSeen, g.count24h, 'S'),
      });
    }

    if (g.runbookId === 'auth.paypal' || hay.includes('paypal.')) {
      out.push({
        id: `stab.paypal:${g.fingerprint}`,
        fingerprint: g.fingerprint,
        title: 'PayPal path failing',
        because: `${g.event ?? g.title} on ${g.scriptName}, ${g.count24h} in 24h. Subscription checkout depends on this.`,
        actions: ['Verify PayPal secrets and webhook', 'Fix catalog/subscription before other features'],
        files: rb?.files ?? ['workers/auth-worker/src/features/member/paypal/subscriptions.ts'],
        effort: 'M',
        severity: 'high',
        status: 'advisory',
        priorityScore: score('high', g.lastSeen, g.count24h, 'M'),
      });
    }
  }

  const seen = new Set<string>();
  return out
    .filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    })
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 20);
}
