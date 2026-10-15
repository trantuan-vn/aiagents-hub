import { describe, expect, it } from 'vitest';

import { isSiteSupportChat } from './site-support';

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
