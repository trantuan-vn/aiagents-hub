/**
 * Static showcase sites for a workflow. Files live in the version R2 bucket
 * under `workflow-promo/`, away from `version-*.json` backups.
 * Community readers get these files only — never the workflow graph.
 */

export const PROMO_MAX_FILES = 60;
export const PROMO_MAX_FILE_BYTES = 1_500_000;
export const PROMO_MAX_TOTAL_BYTES = 5_000_000;

export type PromoNormalizeError = 'empty' | 'missing_index' | 'too_many' | 'too_large' | 'bad_file';

export type PromoBytesFile = { path: string; bytes: Uint8Array };

export type NormalizedPromoFile = { path: string; bytes: Uint8Array; contentType: string };

const CONTENT_TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  json: 'application/json',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ico: 'image/x-icon',
  txt: 'text/plain; charset=utf-8',
  woff: 'font/woff',
  woff2: 'font/woff2',
  webmanifest: 'application/manifest+json',
  map: 'application/json',
};

export type PromoBucket = {
  put(
    key: string,
    value: Uint8Array | ArrayBuffer | string,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; text(): Promise<string> } | null>;
  list(options: { prefix: string; cursor?: string }): Promise<{
    objects: { key: string }[];
    truncated: boolean;
    cursor?: string;
  }>;
  delete(keys: string[]): Promise<unknown>;
};

export type StoredPromoSite = {
  updatedAt: string;
  files: { path: string; contentType: string; contentBase64: string }[];
};

type Manifest = {
  updatedAt: string;
  files: { path: string; contentType: string; bytes: number }[];
};

function contentTypeForPath(path: string): string | null {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return CONTENT_TYPES[ext] ?? null;
}

function isIgnoredPath(path: string): boolean {
  const parts = path.split('/');
  return parts.some(
    (part) =>
      part === '__MACOSX' ||
      part === '.DS_Store' ||
      part === 'Thumbs.db' ||
      part.startsWith('.'),
  );
}

function cleanPath(raw: string): string | null {
  const path = raw.replace(/\\/g, '/').replace(/^\/+/, '').trim();
  if (!path || path.length > 180 || /[\u0000-\u001f]/.test(path)) return null;
  const parts = path.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) return null;
  return parts.join('/');
}

/** Drop a single wrapping folder until index.html sits at the site root. */
export function hoistPromoPaths(paths: string[]): string[] {
  let current = paths.slice();
  for (let depth = 0; depth < 4; depth += 1) {
    if (current.some((path) => /^index\.html?$/i.test(path))) return current;
    if (current.length === 0 || current.some((path) => !path.includes('/'))) return current;
    const root = current[0].split('/')[0];
    if (current.some((path) => path.split('/')[0] !== root)) return current;
    current = current.map((path) => path.slice(path.indexOf('/') + 1));
  }
  return current;
}

export function normalizePromoBytes(
  input: PromoBytesFile[],
): { ok: true; files: NormalizedPromoFile[] } | { ok: false; error: PromoNormalizeError } {
  const cleaned: PromoBytesFile[] = [];
  for (const file of input) {
    const path = cleanPath(file.path);
    if (!path) return { ok: false, error: 'bad_file' };
    if (isIgnoredPath(path)) continue;
    cleaned.push({ path, bytes: file.bytes });
  }
  if (cleaned.length === 0) return { ok: false, error: 'empty' };

  const hoisted = hoistPromoPaths(cleaned.map((file) => file.path));
  const byPath = new Map<string, NormalizedPromoFile>();
  for (let i = 0; i < cleaned.length; i += 1) {
    const path = hoisted[i];
    if (!path || isIgnoredPath(path)) continue;
    const contentType = contentTypeForPath(path);
    if (!contentType) return { ok: false, error: 'bad_file' };
    byPath.set(path.toLowerCase(), { path, bytes: cleaned[i].bytes, contentType });
  }

  const files = [...byPath.values()];
  if (files.length === 0) return { ok: false, error: 'empty' };
  if (files.length > PROMO_MAX_FILES) return { ok: false, error: 'too_many' };
  if (!files.some((file) => /^index\.html?$/i.test(file.path))) return { ok: false, error: 'missing_index' };

  let total = 0;
  for (const file of files) {
    if (file.bytes.byteLength > PROMO_MAX_FILE_BYTES) return { ok: false, error: 'too_large' };
    total += file.bytes.byteLength;
    if (total > PROMO_MAX_TOTAL_BYTES) return { ok: false, error: 'too_large' };
  }
  return { ok: true, files };
}

function decodeBase64(value: unknown): Uint8Array | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/\s/g, '');
  if (!cleaned || cleaned.length > 2_100_000 || cleaned.length % 4 === 1) return null;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) return null;
  try {
    const binary = atob(cleaned);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function normalizePromoUpload(
  body: unknown,
): { ok: true; files: NormalizedPromoFile[] } | { ok: false; error: PromoNormalizeError } {
  const files = (body as { files?: unknown } | null)?.files;
  if (!Array.isArray(files) || files.length === 0) return { ok: false, error: 'empty' };
  if (files.length > PROMO_MAX_FILES + 20) return { ok: false, error: 'too_many' };
  const decoded: PromoBytesFile[] = [];
  for (const entry of files) {
    if (!entry || typeof entry !== 'object') return { ok: false, error: 'bad_file' };
    const path = (entry as { path?: unknown }).path;
    const bytes = decodeBase64((entry as { contentBase64?: unknown }).contentBase64);
    if (typeof path !== 'string' || !bytes) return { ok: false, error: 'bad_file' };
    decoded.push({ path, bytes });
  }
  return normalizePromoBytes(decoded);
}

export function isPromoOwnerKey(ownerId: string): boolean {
  return /^[0-9a-f]{64}$/i.test(ownerId);
}

function sitePrefix(ownerId: string, workflowId: number): string {
  return `workflow-promo/v1/${ownerId}/${workflowId}/`;
}

async function listKeys(bucket: PromoBucket, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor });
    for (const obj of page.objects) keys.push(obj.key);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return keys;
}

export async function putPromoSite(
  bucket: PromoBucket,
  ownerId: string,
  workflowId: number,
  files: NormalizedPromoFile[],
): Promise<StoredPromoSite> {
  const prefix = sitePrefix(ownerId, workflowId);
  const manifestKey = `${prefix}manifest.json`;
  const updatedAt = new Date().toISOString();
  const nextKeys = new Set<string>();

  await Promise.all(
    files.map(async (file) => {
      const key = `${prefix}files/${file.path}`;
      nextKeys.add(key);
      const copy = new Uint8Array(file.bytes.byteLength);
      copy.set(file.bytes);
      await bucket.put(key, copy, { httpMetadata: { contentType: file.contentType } });
    }),
  );

  const manifest: Manifest = {
    updatedAt,
    files: files.map((file) => ({
      path: file.path,
      contentType: file.contentType,
      bytes: file.bytes.byteLength,
    })),
  };
  await bucket.put(manifestKey, JSON.stringify(manifest), {
    httpMetadata: { contentType: 'application/json' },
  });

  const existing = await listKeys(bucket, prefix);
  const stale = existing.filter((key) => key !== manifestKey && !nextKeys.has(key));
  if (stale.length > 0) await bucket.delete(stale);

  return {
    updatedAt,
    files: files.map((file) => ({
      path: file.path,
      contentType: file.contentType,
      contentBase64: bytesToBase64(file.bytes),
    })),
  };
}

export async function getPromoSite(
  bucket: PromoBucket,
  ownerId: string,
  workflowId: number,
): Promise<StoredPromoSite | null> {
  if (!isPromoOwnerKey(ownerId) || !Number.isInteger(workflowId) || workflowId <= 0) return null;
  const prefix = sitePrefix(ownerId, workflowId);
  const manifestObj = await bucket.get(`${prefix}manifest.json`);
  if (!manifestObj) return null;
  let manifest: Manifest;
  try {
    manifest = JSON.parse(await manifestObj.text()) as Manifest;
  } catch {
    return null;
  }
  if (!manifest || !Array.isArray(manifest.files)) return null;

  const files: StoredPromoSite['files'] = [];
  for (const file of manifest.files) {
    if (!file?.path || !file.contentType) continue;
    const obj = await bucket.get(`${prefix}files/${file.path}`);
    if (!obj) continue;
    const bytes = new Uint8Array(await obj.arrayBuffer());
    files.push({
      path: file.path,
      contentType: file.contentType,
      contentBase64: bytesToBase64(bytes),
    });
  }
  if (!files.some((file) => /^index\.html?$/i.test(file.path))) return null;
  return { updatedAt: manifest.updatedAt || new Date(0).toISOString(), files };
}

export async function deletePromoSite(
  bucket: PromoBucket | undefined,
  ownerId: string,
  workflowId: number,
): Promise<void> {
  if (!bucket || !isPromoOwnerKey(ownerId) || !Number.isInteger(workflowId) || workflowId <= 0) return;
  try {
    const keys = await listKeys(bucket, sitePrefix(ownerId, workflowId));
    if (keys.length > 0) await bucket.delete(keys);
  } catch {
    /* Showcase cleanup must not block workflow deletion. */
  }
}
