import { describe, expect, it } from 'vitest';

import { isSiteSupportChat, siteSupportAnswerNote, siteSupportReplySeconds } from './site-support';

const env = {
  SITE_SUPPORT_WORKFLOW_ID: '34',
  SITE_SUPPORT_OWNER_ID: 'abc',
  SITE_SUPPORT_CHAT_PATH: 'trigger-support',
};

describe('isSiteSupportChat', () => {
  it('matches only the configured workflow, owner, and path', () => {
    expect(isSiteSupportChat(env, 34, 'abc', 'trigger-support')).toBe(true);
    expect(isSiteSupportChat(env, 34, 'abc', '/trigger-support')).toBe(true);
    expect(isSiteSupportChat(env, 35, 'abc', 'trigger-support')).toBe(false);
    expect(isSiteSupportChat(env, 34, 'other', 'trigger-support')).toBe(false);
    expect(isSiteSupportChat(env, 34, 'abc', 'other-chat')).toBe(false);
  });

  it('stays off when the support target is not configured', () => {
    expect(isSiteSupportChat({}, 34, 'abc', 'trigger-support')).toBe(false);
  });
});

describe('siteSupportAnswerNote', () => {
  const definition = {
    nodes: [{ type: 'trigger', data: { triggerKind: 'chat', chatPath: 'trigger-support' } }],
  };

  it('asks the public support agent for an HTML fragment', () => {
    const note = siteSupportAnswerNote(env, 34, 'abc', definition);
    expect(note).toContain('HTML fragment');
    expect(note).toContain('__support_cta__');
    expect(note.indexOf('<')).toBeGreaterThan(-1);
  });

  it('stays empty for every other chat', () => {
    expect(siteSupportAnswerNote(env, 35, 'abc', definition)).toBe('');
    expect(siteSupportAnswerNote({}, 34, 'abc', definition)).toBe('');
  });
});

describe('siteSupportReplySeconds', () => {
  it('uses the published tools agent cap', () => {
    expect(
      siteSupportReplySeconds({
        nodes: [{ type: 'agent', data: { agentKind: 'tools_agent', maxReasoningSeconds: 30 } }],
      }),
    ).toBe(30);
  });

  it('hides the hint when the agent has no cap', () => {
    expect(
      siteSupportReplySeconds({
        nodes: [{ type: 'agent', data: { agentKind: 'tools_agent' } }],
      }),
    ).toBeNull();
  });
});
