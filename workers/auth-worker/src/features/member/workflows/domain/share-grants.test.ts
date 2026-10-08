import { describe, expect, it } from 'vitest';

import {
  applyShareGrantsOnWrite,
  normalizeShareGrants,
  parseShareGrants,
  runnerMayUseTrigger,
  shareGrantVisibleTo,
  triggerKindsJsonForRunner,
} from './share-grants';

const list = [
  { id: 'all', audience: 'all', emails: ['ignored@x.com'], triggerKinds: ['chat', 'form'] },
  { id: 'one', audience: 'users', emails: ['A@Example.com', 'a@example.com', 'nope'], triggerKinds: ['webhook'] },
  { id: 'many', audience: 'users', emails: ['b@example.com', 'c@example.com'], triggerKinds: ['manual', 'webhook'] },
];

describe('share grants', () => {
  it('keeps legacy workflows on the public trigger list', () => {
    expect(parseShareGrants(null)).toBeNull();
    expect(parseShareGrants('')).toBeNull();
    expect(parseShareGrants('{')).toBeNull();
    expect(runnerMayUseTrigger({
      publicTriggerKinds: '["chat"]',
      shareGrants: null,
      runnerIdentifier: 'someone@x.com',
      kind: 'chat',
    })).toBe(true);
    expect(runnerMayUseTrigger({
      publicTriggerKinds: '["chat"]',
      shareGrants: null,
      runnerIdentifier: 'someone@x.com',
      kind: 'form',
    })).toBe(false);
    expect(shareGrantVisibleTo(null, 'someone@x.com')).toBe(true);
  });

  it('normalizes audience, emails, and trigger order', () => {
    const raw = normalizeShareGrants(JSON.stringify(list));
    expect(JSON.parse(raw!)).toEqual([
      { id: 'all', audience: 'all', emails: [], triggerKinds: ['chat', 'form'] },
      { id: 'one', audience: 'users', emails: ['a@example.com'], triggerKinds: ['webhook'] },
      { id: 'many', audience: 'users', emails: ['b@example.com', 'c@example.com'], triggerKinds: ['manual', 'webhook'] },
    ]);
  });

  it('unions matching rows and denies everyone else', () => {
    const shareGrants = JSON.stringify(list);
    const allow = (email: string, kind: 'manual' | 'chat' | 'form' | 'webhook') =>
      runnerMayUseTrigger({ publicTriggerKinds: '[]', shareGrants, runnerIdentifier: email, kind });

    expect(allow('stranger@x.com', 'chat')).toBe(true);
    expect(allow('stranger@x.com', 'webhook')).toBe(false);
    expect(allow('a@example.com', 'webhook')).toBe(true);
    expect(allow('a@example.com', 'manual')).toBe(false);
    expect(allow('c@example.com', 'manual')).toBe(true);
    expect(allow('c@example.com', 'chat')).toBe(true);
    expect(shareGrantVisibleTo(shareGrants, 'stranger@x.com')).toBe(true);
  });

  it('hides a user-only workflow from people who are not listed', () => {
    const shareGrants = JSON.stringify([
      { id: 'vip', audience: 'users', emails: ['vip@example.com'], triggerKinds: ['chat'] },
    ]);
    expect(shareGrantVisibleTo(shareGrants, 'vip@example.com')).toBe(true);
    expect(shareGrantVisibleTo(shareGrants, 'other@example.com')).toBe(false);
    expect(runnerMayUseTrigger({
      publicTriggerKinds: '["chat","form","webhook","manual"]',
      shareGrants,
      runnerIdentifier: 'other@example.com',
      kind: 'chat',
    })).toBe(false);
    expect(triggerKindsJsonForRunner({
      publicTriggerKinds: null,
      shareGrants,
      runnerIdentifier: 'vip@example.com',
    })).toBe('["chat"]');
    expect(triggerKindsJsonForRunner({
      publicTriggerKinds: '["form"]',
      shareGrants: null,
      runnerIdentifier: 'vip@example.com',
    })).toBeNull();
  });

  it('derives the public trigger set from All rows when saving', () => {
    const body: { shareGrants?: string | null; publicTriggerKinds?: string | null } = {
      shareGrants: JSON.stringify(list),
      publicTriggerKinds: '["webhook"]',
    };
    applyShareGrantsOnWrite(body);
    expect(body.publicTriggerKinds).toBe('["chat","form"]');
    expect(JSON.parse(body.shareGrants!)).toHaveLength(3);

    const legacy: { shareGrants?: string | null; publicTriggerKinds?: string | null } = {
      publicTriggerKinds: '["chat"]',
    };
    applyShareGrantsOnWrite(legacy);
    expect(legacy.publicTriggerKinds).toBe('["chat"]');
  });
});
