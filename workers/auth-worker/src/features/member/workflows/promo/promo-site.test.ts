import { describe, expect, it } from 'vitest';

import {
  deletePromoSite,
  getPromoSite,
  hoistPromoPaths,
  normalizePromoBytes,
  normalizePromoUpload,
  putPromoSite,
  type PromoBucket,
} from './promo-site';

const OWNER = 'a'.repeat(64);

function textFile(path: string, text: string) {
  return { path, bytes: new TextEncoder().encode(text) };
}

function memoryBucket(): PromoBucket & { store: Map<string, { body: Uint8Array; type: string }> } {
  const store = new Map<string, { body: Uint8Array; type: string }>();
  return {
    store,
    async put(key, value, options) {
      const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
      store.set(key, { body: bytes, type: options?.httpMetadata?.contentType ?? '' });
    },
    async get(key) {
      const hit = store.get(key);
      if (!hit) return null;
      const body = hit.body;
      return {
        async arrayBuffer() {
          return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
        },
        async text() {
          return new TextDecoder().decode(body);
        },
      };
    },
    async list({ prefix }) {
      return {
        objects: [...store.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })),
        truncated: false,
      };
    },
    async delete(keys) {
      for (const key of keys) store.delete(key);
    },
  };
}

describe('promo site paths', () => {
  it('lifts index.html out of a wrapping folder', () => {
    expect(hoistPromoPaths(['dist/index.html', 'dist/css/app.css'])).toEqual(['index.html', 'css/app.css']);
  });

  it('rejects traversal and files that are not a static site', () => {
    expect(normalizePromoBytes([textFile('../index.html', '<h1>x</h1>')])).toEqual({ ok: false, error: 'bad_file' });
    expect(normalizePromoBytes([textFile('index.html', '<h1>x</h1>'), textFile('app.exe', 'MZ')])).toEqual({
      ok: false,
      error: 'bad_file',
    });
    expect(normalizePromoBytes([textFile('readme.txt', 'hi')])).toEqual({ ok: false, error: 'missing_index' });
  });

  it('drops junk files and keeps a publishable site', () => {
    const result = normalizePromoBytes([
      textFile('site/.DS_Store', 'junk'),
      textFile('site/index.html', '<link rel="stylesheet" href="app.css">'),
      textFile('site/app.css', 'body{color:red}'),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.files.map((file) => file.path).sort()).toEqual(['app.css', 'index.html']);
  });

  it('decodes an upload body', () => {
    const html = btoa('<h1>Hello</h1>');
    const result = normalizePromoUpload({ files: [{ path: 'index.html', contentBase64: html }] });
    expect(result.ok).toBe(true);
  });
});

describe('promo site storage', () => {
  it('round-trips a site and replaces stale files', async () => {
    const bucket = memoryBucket();
    const first = normalizePromoBytes([
      textFile('index.html', '<h1>One</h1>'),
      textFile('old.txt', 'gone'),
    ]);
    if (!first.ok) throw new Error('expected files');
    await putPromoSite(bucket, OWNER, 26, first.files);

    const next = normalizePromoBytes([textFile('index.html', '<h1>Two</h1>')]);
    if (!next.ok) throw new Error('expected files');
    await putPromoSite(bucket, OWNER, 26, next.files);

    const keys = [...bucket.store.keys()];
    expect(keys.some((key) => key.endsWith('/files/old.txt'))).toBe(false);
    const loaded = await getPromoSite(bucket, OWNER, 26);
    expect(loaded?.files).toHaveLength(1);
    expect(atob(loaded?.files[0]?.contentBase64 ?? '')).toBe('<h1>Two</h1>');

    await deletePromoSite(bucket, OWNER, 26);
    expect(bucket.store.size).toBe(0);
  });
});
