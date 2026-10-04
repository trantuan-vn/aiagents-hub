import { describe, expect, it } from 'vitest';

import { assignEnterpriseTriggerKeys, listEnterpriseTriggers } from './trigger-keys';

const def = (nodes: unknown[]) => JSON.stringify({ nodes, edges: [] });
const chat = (id: string, key?: string) => ({
  id,
  type: 'trigger',
  data: { triggerKind: 'chat', label: `Chat ${id}`, ...(key ? { enterpriseTriggerKey: key } : {}) },
});
const keys = (raw: string) => listEnterpriseTriggers(raw).map((t) => [t.nodeId, t.triggerKey]);

describe('assignEnterpriseTriggerKeys', () => {
  it('keys every invokable trigger and skips other nodes', () => {
    const out = assignEnterpriseTriggerKeys(
      null,
      def([
        chat('c1'),
        { id: 'w1', type: 'core', data: { coreKind: 'webhook' } },
        { id: 'f1', type: 'trigger', data: { triggerKind: 'form' } },
        { id: 's1', type: 'trigger', data: { triggerKind: 'schedule' } },
        { id: 'db', type: 'trigger', data: { triggerKind: 'form', formKind: 'database' } },
        { id: 'a1', type: 'agent', data: {} },
      ]),
    );
    expect(listEnterpriseTriggers(out).map((t) => [t.nodeId, t.kind])).toEqual([
      ['c1', 'chat'],
      ['w1', 'webhook'],
      ['f1', 'form'],
      ['s1', 'schedule'],
    ]);
    expect(new Set(listEnterpriseTriggers(out).map((t) => t.triggerKey)).size).toBe(4);
  });

  it('keeps the key of a node when the canvas saves a copy without keys', () => {
    const first = assignEnterpriseTriggerKeys(null, def([chat('c1')]));
    const [[, key]] = keys(first);
    const resaved = assignEnterpriseTriggerKeys(first, def([chat('c1')]));
    expect(keys(resaved)).toEqual([['c1', key]]);
  });

  it('gives a copied node a new key and leaves the original alone', () => {
    const first = assignEnterpriseTriggerKeys(null, def([chat('c1')]));
    const [[, key]] = keys(first);
    const out = assignEnterpriseTriggerKeys(first, def([chat('c2', key), chat('c1', key)]));
    const map = Object.fromEntries(keys(out));
    expect(map.c1).toBe(key);
    expect(map.c2).not.toBe(key);
  });

  it('does not hand a deleted node key to a new node', () => {
    const first = assignEnterpriseTriggerKeys(null, def([chat('c1')]));
    const [[, key]] = keys(first);
    const removed = assignEnterpriseTriggerKeys(first, def([]));
    const added = assignEnterpriseTriggerKeys(removed, def([chat('c9')]));
    expect(keys(added)[0][1]).not.toBe(key);
  });

  it('returns the same string when nothing changes and tolerates bad JSON', () => {
    const first = assignEnterpriseTriggerKeys(null, def([chat('c1')]));
    expect(assignEnterpriseTriggerKeys(first, first)).toBe(first);
    expect(assignEnterpriseTriggerKeys(null, 'not json')).toBe('not json');
  });
});

describe('listEnterpriseTriggers', () => {
  it('describes form inputs without hidden fields and nothing for other kinds', () => {
    const out = assignEnterpriseTriggerKeys(
      null,
      def([
        chat('c1'),
        {
          id: 'f1',
          type: 'trigger',
          data: {
            triggerKind: 'form',
            formCredentialKey: 'secret-key',
            formElements: [
              { id: 'e1', label: 'Email', fieldType: 'email', fieldName: 'email', requiredField: true },
              { id: 'e2', label: 'Plan', fieldType: 'dropdown', fieldName: 'plan', fieldOptions: 'pro\n business \n' },
              { id: 'e3', label: 'Ref', fieldType: 'hidden', fieldName: 'ref' },
            ],
          },
        },
      ]),
    );
    const [chatTrigger, form] = listEnterpriseTriggers(out);
    expect(chatTrigger).not.toHaveProperty('fields');
    expect(form.fields).toEqual([
      { fieldName: 'email', label: 'Email', fieldType: 'email', required: true },
      { fieldName: 'plan', label: 'Plan', fieldType: 'dropdown', required: false, options: ['pro', 'business'] },
    ]);
    expect(JSON.stringify(form)).not.toContain('secret-key');
  });
});
