import { describe, expect, it } from 'vitest';

import { summarizeWorkflowListTriggers } from './list-trigger-summary';

describe('summarizeWorkflowListTriggers', () => {
  it('returns empty triggers for missing or invalid definitions', () => {
    expect(summarizeWorkflowListTriggers(undefined)).toEqual({
      chat: null,
      forms: [],
      webhooks: [],
    });
    expect(summarizeWorkflowListTriggers('{')).toEqual({
      chat: null,
      forms: [],
      webhooks: [],
    });
  });

  it('prefers a public chat node and captures form plus webhook paths', () => {
    const definition = JSON.stringify({
      nodes: [
        {
          id: 'chat-private',
          type: 'trigger',
          data: { triggerKind: 'chat', chatPublic: false, chatPath: 'private-chat' },
        },
        {
          id: 'chat-public',
          type: 'trigger',
          data: { triggerKind: 'chat', chatPath: 'support' },
        },
        {
          id: 'form-1',
          type: 'trigger',
          data: { triggerKind: 'form', label: 'Lead form', formPath: 'lead' },
        },
        {
          id: 'wh-1',
          type: 'core',
          data: { coreKind: 'webhook', webhookPath: 'ask' },
        },
      ],
    });

    expect(summarizeWorkflowListTriggers(definition)).toEqual({
      chat: { public: true, path: 'support', hosted: true },
      forms: [{ nodeId: 'form-1', label: 'Lead form', path: 'lead' }],
      webhooks: [{ nodeId: 'wh-1', label: 'Webhook', path: 'ask' }],
    });
  });

  it('hides trigger kinds the owner kept private', () => {
    const definition = JSON.stringify({
      nodes: [
        { id: 'chat-1', type: 'trigger', data: { triggerKind: 'chat' } },
        { id: 'form-1', type: 'trigger', data: { triggerKind: 'form' } },
        { id: 'wh-1', type: 'core', data: { coreKind: 'webhook' } },
      ],
    });
    const summary = summarizeWorkflowListTriggers(definition, '["form"]');
    expect(summary.chat).toBeNull();
    expect(summary.forms).toHaveLength(1);
    expect(summary.webhooks).toEqual([]);
  });

  it('marks webhook-mode chat as not hosted', () => {
    const definition = JSON.stringify({
      nodes: [
        {
          id: 'chat-1',
          type: 'chat',
          data: { chatMode: 'webhook', chatPublic: true },
        },
      ],
    });
    expect(summarizeWorkflowListTriggers(definition).chat).toEqual({
      public: true,
      path: 'chat-1',
      hosted: false,
    });
  });
});
