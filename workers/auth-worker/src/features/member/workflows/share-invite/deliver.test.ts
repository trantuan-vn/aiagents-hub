import { describe, expect, it } from 'vitest';

import { buildShareInviteEmail } from './email.js';
import { collectInviteTargets, deliverShareInvites, type ShareInviteEnv } from './deliver.js';

function memoryKv() {
  const map = new Map<string, string>();
  return {
    map,
    async get(key: string) {
      return map.get(key) ?? null;
    },
    async put(key: string, value: string) {
      map.set(key, value);
    },
  };
}

function workflow(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Onboarding <script>',
    description: 'Help the team ship.',
    isShared: 1,
    status: 'published',
    shareGrants: JSON.stringify([
      {
        id: 'u',
        audience: 'users',
        emails: ['new@example.com', 'old@example.com'],
        triggerKinds: ['manual', 'chat'],
      },
    ]),
    definition: JSON.stringify({
      nodes: [{ id: 'c1', type: 'trigger', data: { triggerKind: 'chat', chatPath: 'hello' } }],
      edges: [],
    }),
    ...overrides,
  };
}

describe('share invite targets', () => {
  it('unions trigger kinds across user rows and ignores unknown emails', () => {
    const { targets, missing } = collectInviteTargets(
      [
        { id: 'a', audience: 'users', emails: ['a@example.com'], triggerKinds: ['chat'] },
        { id: 'b', audience: 'users', emails: ['a@example.com'], triggerKinds: ['form'] },
        { id: 'all', audience: 'all', emails: [], triggerKinds: ['webhook'] },
      ],
      ['A@Example.com', 'missing@example.com'],
    );
    expect(missing).toEqual(['missing@example.com']);
    expect(targets).toEqual([{ email: 'a@example.com', triggerKinds: ['chat', 'form'] }]);
  });
});

describe('share invite email', () => {
  it('writes a first-run welcome and escapes the workflow name', () => {
    const message = buildShareInviteEmail({
      locale: 'vi',
      firstTime: true,
      workflowName: 'Onboarding <script>',
      workflowDescription: 'A short guide',
      ownerEmail: 'owner@example.com',
      recipientEmail: 'new@example.com',
      triggerKinds: ['chat', 'webhook'],
      loginUrl: 'https://aiagents-hub.vn/auth/v3/login?redirect=https%3A%2F%2Faiagents-hub.vn%2Fdashboard',
      links: [{ kind: 'chat', label: 'Chat', url: 'https://api.aiagents-hub.vn/chat/7/hello' }],
    });
    expect(message.subject).toContain('Onboarding');
    expect(message.html).toContain('lần đầu');
    expect(message.html).toContain('Onboarding &lt;script&gt;');
    expect(message.html).not.toContain('<script>');
    expect(message.html).toContain('https://api.aiagents-hub.vn/chat/7/hello');
    expect(message.html).toContain('Webhook');
    expect(message.text).toContain('new@example.com');
  });

  it('writes a shorter note for someone who already has an account', () => {
    const message = buildShareInviteEmail({
      locale: 'en',
      firstTime: false,
      workflowName: 'Onboarding',
      workflowDescription: '',
      ownerEmail: 'owner@example.com',
      recipientEmail: 'old@example.com',
      triggerKinds: ['manual'],
      loginUrl: 'https://aiagents-hub.vn/auth/v3/login',
      links: [],
    });
    expect(message.html).toContain('just gave you access');
    expect(message.html).not.toContain('first time');
    expect(message.html).not.toContain('How to start');
    expect(message.html).toContain('Run in the app');
  });
});

describe('deliver share invites', () => {
  const env = (): ShareInviteEnv => ({
    FRONTEND_URL: 'https://aiagents-hub.vn',
    BASE_URL: 'https://api.aiagents-hub.vn',
    NONCE_KV: memoryKv(),
  });

  it('sends a welcome to new addresses and an access note to existing ones', async () => {
    const sent: Array<{ to: string; html?: string; replyTo?: string }> = [];
    const result = await deliverShareInvites({
      env: env(),
      workflow: workflow(),
      workflowId: 7,
      ownerId: 'owner-do',
      ownerEmail: 'Owner@Example.com',
      emails: ['new@example.com', 'old@example.com'],
      locale: 'vi',
      lookupAccounts: async () => new Set(['old@example.com']),
      send: async (opts) => {
        sent.push(opts);
      },
    });
    expect(result).toMatchObject({ ok: true, sent: 2, firstTime: 1, existing: 1 });
    expect(sent[0]?.html).toContain('lần đầu');
    expect(sent[0]?.html).toContain('/chat/7/hello');
    expect(sent[1]?.html).not.toContain('lần đầu');
    expect(sent[0]?.replyTo).toBe('owner@example.com');
    expect(sent[0]?.html).toContain('redirect=');
  });

  it('refuses addresses that are not on the saved user list', async () => {
    const result = await deliverShareInvites({
      env: env(),
      workflow: workflow(),
      workflowId: 7,
      ownerId: 'owner-do',
      ownerEmail: 'owner@example.com',
      emails: ['stranger@example.com'],
      locale: 'vi',
      send: async () => {
        throw new Error('should not send');
      },
    });
    expect(result).toEqual({ ok: false, code: 'SHARE_INVITE_UNSAVED', emails: ['stranger@example.com'] });
  });

  it('refuses a draft or private workflow', async () => {
    const result = await deliverShareInvites({
      env: env(),
      workflow: workflow({ status: 'draft' }),
      workflowId: 7,
      ownerId: 'owner-do',
      ownerEmail: 'owner@example.com',
      emails: ['new@example.com'],
      locale: 'en',
    });
    expect(result).toEqual({ ok: false, code: 'SHARE_INVITE_NOT_LIVE' });
  });

  it('skips an address that was mailed a moment ago', async () => {
    const kv = memoryKv();
    const base = { ...env(), NONCE_KV: kv };
    const send = async () => {};
    const first = await deliverShareInvites({
      env: base,
      workflow: workflow(),
      workflowId: 7,
      ownerId: 'owner-do',
      ownerEmail: 'owner@example.com',
      emails: ['new@example.com'],
      locale: 'vi',
      lookupAccounts: async () => new Set<string>(),
      send,
    });
    const second = await deliverShareInvites({
      env: base,
      workflow: workflow(),
      workflowId: 7,
      ownerId: 'owner-do',
      ownerEmail: 'owner@example.com',
      emails: ['new@example.com'],
      locale: 'vi',
      lookupAccounts: async () => new Set<string>(),
      send,
    });
    expect(first).toMatchObject({ ok: true, sent: 1, firstTime: 1 });
    expect(second).toEqual({
      ok: true,
      sent: 0,
      firstTime: 0,
      existing: 0,
      skipped: [{ email: 'new@example.com', reason: 'cooldown' }],
    });
  });

  it('stops when the hourly send cap is already used', async () => {
    const now = 1_700_000_000_000;
    const kv = memoryKv();
    kv.map.set(`share-invite-hour:owner-do:${Math.floor(now / 3_600_000)}`, '60');
    const result = await deliverShareInvites({
      env: { ...env(), NONCE_KV: kv },
      workflow: workflow(),
      workflowId: 7,
      ownerId: 'owner-do',
      ownerEmail: 'owner@example.com',
      emails: ['new@example.com'],
      locale: 'vi',
      now,
      send: async () => {
        throw new Error('should not send');
      },
    });
    expect(result).toEqual({ ok: false, code: 'SHARE_INVITE_RATE' });
  });
});
