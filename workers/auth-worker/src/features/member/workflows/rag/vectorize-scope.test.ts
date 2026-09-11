import { describe, expect, it } from 'vitest';

import {
  buildVectorizeScope,
  normalizeVectorizeCollection,
  resolveVectorizeScope,
  VECTORIZE_COLLECTION,
} from './vectorize-scope.js';

describe('vectorize-scope', () => {
  it('normalizeVectorizeCollection maps legacy names to shared index', () => {
    expect(normalizeVectorizeCollection()).toBe(VECTORIZE_COLLECTION);
    expect(normalizeVectorizeCollection('vectorize-default')).toBe(VECTORIZE_COLLECTION);
    expect(normalizeVectorizeCollection('VECTORIZE')).toBe(VECTORIZE_COLLECTION);
    expect(normalizeVectorizeCollection('CUSTOM')).toBe('CUSTOM');
  });

  it('buildVectorizeScope isolates per user, workflow, and node', () => {
    expect(buildVectorizeScope('owner-1', 42, 'memory_node-1')).toBe(
      'uowner-1/wf42/nmemory_node-1',
    );
  });

  it('resolveVectorizeScope prefixes partial namespace with owner id', () => {
    expect(resolveVectorizeScope('owner-1', 42, 'mem-1', 'wf42/nmem-1')).toBe(
      'uowner-1/wf42/nmem-1',
    );
  });

  it('resolveVectorizeScope derives scope when namespace is empty', () => {
    expect(resolveVectorizeScope('owner-1', 42, 'mem-1', '')).toBe(
      'uowner-1/wf42/nmem-1',
    );
  });

  it('resolveVectorizeScope keeps fully qualified namespace', () => {
    expect(resolveVectorizeScope('owner-1', 42, 'mem-1', 'uowner-1/wf42/nmem-1')).toBe(
      'uowner-1/wf42/nmem-1',
    );
  });
});
