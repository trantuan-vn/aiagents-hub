/** Shared Workers AI Gateway options and retries for transient capacity errors (3040). */

export const AI_GATEWAY_ID = 'unitoken';

/** Route inference through AI Gateway and retry 429/capacity before failing the request. */
export const WORKERS_AI_GATEWAY = {
  id: AI_GATEWAY_ID,
  retries: {
    maxAttempts: 3 as const,
    retryDelayMs: 400,
    backoff: 'exponential' as const,
  },
};

const CAPACITY_ATTEMPTS = 3;

function aiErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message?: unknown }).message ?? '');
  }
  return String(err ?? '');
}

function aiErrorCode(err: unknown): number | undefined {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = Number((err as { code?: unknown }).code);
    if (Number.isFinite(code)) return code;
  }
  const match = aiErrorMessage(err).match(/\b(30\d{2})\b/);
  return match ? Number(match[1]) : undefined;
}

/** 3036 = daily neuron cap; retrying cannot succeed. */
export function isAiAccountLimitedError(err: unknown): boolean {
  const code = aiErrorCode(err);
  if (code === 3036) return true;
  return /used up your daily free allocation|neuron allocation/i.test(aiErrorMessage(err));
}

/** 3040 = no GPU capacity right now; a short backoff often succeeds. */
export function isAiCapacityError(err: unknown): boolean {
  if (isAiAccountLimitedError(err)) return false;
  const code = aiErrorCode(err);
  if (code === 3040) return true;
  return /capacity temporarily exceeded|no more data centers to forward/i.test(aiErrorMessage(err));
}

function defaultWait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type AiCapacityRetryOptions = {
  maxAttempts?: number;
  wait?: (ms: number) => Promise<void>;
};

export async function withAiCapacityRetry<T>(
  fn: () => Promise<T>,
  options: AiCapacityRetryOptions = {},
): Promise<T> {
  const maxAttempts = Math.min(5, Math.max(1, options.maxAttempts ?? CAPACITY_ATTEMPTS));
  const wait = options.wait ?? defaultWait;
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!isAiCapacityError(e) || attempt === maxAttempts - 1) throw e;
      const waitMs = 250 * 2 ** attempt + Math.floor(Math.random() * 100);
      await wait(waitMs);
    }
  }
  throw lastErr;
}
