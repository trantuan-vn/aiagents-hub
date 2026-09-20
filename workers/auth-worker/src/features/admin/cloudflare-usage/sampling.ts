import {
  CloudflareUsageError,
  SAMPLING_APPLY_KV_KEY,
  SAMPLING_DEFAULT_RATE,
} from './domain.js';
import { getWorkerObservability, patchWorkerObservability, readUsageToken } from './cloudflare-client.js';
import { HUB_WRANGLER_FACTS } from './inventory.js';
import { clampSamplingRate } from './phase3.js';
import { writeUsageAudit } from './infrastructure.js';

export type SamplingScriptState = {
  scriptName: string;
  applyAllowed: boolean;
  enabled: boolean;
  headSamplingRate: number | null;
  readable: boolean;
  error?: string;
};

export type SamplingApplyRecord = {
  at: string;
  actor: string;
  rate: number;
  scripts: Array<{ scriptName: string; previousRate: number | null; nextRate: number }>;
};

export async function listSampling(env: Env): Promise<{
  scripts: SamplingScriptState[];
  lastApply: SamplingApplyRecord | null;
  defaultRate: number;
}> {
  const token = await readUsageToken(env);
  const accountId = env.ACCOUNT_ID;
  const safe = new Set<string>(HUB_WRANGLER_FACTS.samplingSafeWorkerNames);
  const scripts: SamplingScriptState[] = [];
  for (const name of HUB_WRANGLER_FACTS.workerNames) {
    const row = await getWorkerObservability(token, accountId, name);
    scripts.push({
      scriptName: name,
      applyAllowed: safe.has(name),
      enabled: row.enabled,
      headSamplingRate: row.headSamplingRate,
      readable: row.readable,
      error: row.error,
    });
  }
  return { scripts, lastApply: await loadLastApply(env), defaultRate: SAMPLING_DEFAULT_RATE };
}

async function loadLastApply(env: Env): Promise<SamplingApplyRecord | null> {
  try {
    const raw = await env.SYSTEM_CONFIG_KV.get(SAMPLING_APPLY_KV_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SamplingApplyRecord;
  } catch {
    return null;
  }
}

export async function applySampling(
  env: Env,
  actor: string,
  opts: { confirm?: boolean; rate?: number; scripts?: string[] },
): Promise<SamplingApplyRecord> {
  if (opts.confirm !== true) {
    throw new CloudflareUsageError('apply_confirm_required', 'Pass { confirm: true } to apply head_sampling_rate', 400);
  }
  const rate = clampSamplingRate(opts.rate ?? SAMPLING_DEFAULT_RATE);
  const allowed = new Set<string>(HUB_WRANGLER_FACTS.samplingSafeWorkerNames);
  const requested = (opts.scripts ?? [...HUB_WRANGLER_FACTS.samplingSafeWorkerNames]).filter((s) => allowed.has(s));
  if (!requested.length) {
    throw new CloudflareUsageError('apply_confirm_required', 'No safe scripts selected (auth/web stay at 100%)', 400);
  }
  const token = await readUsageToken(env);
  const accountId = env.ACCOUNT_ID;
  const current = await listSampling(env);
  const record: SamplingApplyRecord = { at: new Date().toISOString(), actor, rate, scripts: [] };
  try {
    for (const scriptName of requested) {
      const before = current.scripts.find((s) => s.scriptName === scriptName);
      const patched = await patchWorkerObservability(token, accountId, scriptName, rate);
      if (!patched.ok) {
        if (patched.status === 401 || patched.status === 403) {
          throw new CloudflareUsageError(
            'apply_forbidden',
            'CLOUDFLARE_USAGE_API_TOKEN cannot PATCH Worker script settings. Grant Workers Scripts Edit, then retry. Auth/web were not changed.',
            403,
          );
        }
        throw new CloudflareUsageError('apply_forbidden', patched.error || `Failed to patch ${scriptName}`, 503);
      }
      record.scripts.push({
        scriptName,
        previousRate: before?.headSamplingRate ?? null,
        nextRate: rate,
      });
    }
  } catch (err) {
    for (const row of record.scripts) {
      const previous = row.previousRate == null ? 1 : row.previousRate;
      await patchWorkerObservability(token, accountId, row.scriptName, previous);
    }
    throw err;
  }
  await env.SYSTEM_CONFIG_KV.put(SAMPLING_APPLY_KV_KEY, JSON.stringify(record));
  await writeUsageAudit(env, actor, 'sampling_apply', JSON.stringify({ rate, scripts: requested }));
  return record;
}

export async function rollbackSampling(env: Env, actor: string, opts: { confirm?: boolean }): Promise<SamplingApplyRecord> {
  if (opts.confirm !== true) {
    throw new CloudflareUsageError('apply_confirm_required', 'Pass { confirm: true } to rollback head_sampling_rate', 400);
  }
  const last = await loadLastApply(env);
  if (!last?.scripts.length) {
    throw new CloudflareUsageError('rollback_unavailable', 'No sampling apply to roll back', 400);
  }
  const token = await readUsageToken(env);
  const accountId = env.ACCOUNT_ID;
  for (const row of last.scripts) {
    const previous = row.previousRate == null ? 1 : row.previousRate;
    const patched = await patchWorkerObservability(token, accountId, row.scriptName, previous);
    if (!patched.ok) {
      if (patched.status === 401 || patched.status === 403) {
        throw new CloudflareUsageError(
          'apply_forbidden',
          'CLOUDFLARE_USAGE_API_TOKEN cannot PATCH Worker script settings to roll back sampling',
          403,
        );
      }
      throw new CloudflareUsageError('apply_forbidden', patched.error || `Failed to roll back ${row.scriptName}`, 503);
    }
  }
  await env.SYSTEM_CONFIG_KV.delete(SAMPLING_APPLY_KV_KEY);
  await writeUsageAudit(env, actor, 'sampling_rollback', last.at);
  return last;
}
