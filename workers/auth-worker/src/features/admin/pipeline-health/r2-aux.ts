import type { AuxBucketHealth } from './domain.js';

async function probeBucket(
  id: AuxBucketHealth['id'],
  binding: string,
  bucket: R2Bucket | undefined,
): Promise<AuxBucketHealth> {
  const checkedAt = new Date().toISOString();
  if (!bucket) {
    return {
      id,
      binding,
      status: 'unavailable',
      summary: `${binding} binding missing`,
      objectCountHint: null,
      checkedAt,
    };
  }
  try {
    const listed = await bucket.list({ limit: 1 });
    const truncated = listed.truncated === true;
    const count = listed.objects?.length ?? 0;
    return {
      id,
      binding,
      status: 'healthy',
      summary: truncated
        ? 'Readable (has objects)'
        : count > 0
          ? 'Readable (≤1 object listed)'
          : 'Readable (empty or no objects in first page)',
      objectCountHint: truncated ? null : count,
      checkedAt,
    };
  } catch (e) {
    return {
      id,
      binding,
      status: 'watch',
      summary: e instanceof Error ? e.message.slice(0, 200) : 'list failed',
      objectCountHint: null,
      checkedAt,
    };
  }
}

/** Secondary R2 health (eKYC + version backup) — not lakehouse archive. */
export async function probeAuxBuckets(env: Env): Promise<AuxBucketHealth[]> {
  return Promise.all([
    probeBucket('ekyc', 'R2_EKYC_BUCKET', env.R2_EKYC_BUCKET),
    probeBucket('version_backup', 'R2_VERSION_BUCKET', env.R2_VERSION_BUCKET),
  ]);
}
