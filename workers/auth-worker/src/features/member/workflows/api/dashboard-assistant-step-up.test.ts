import { describe, expect, it } from 'vitest';

import {
  dashboardAssistantEmbeddedChat,
  dashboardAssistantStepUpDenied,
  isDashboardAssistantChat,
  isDashboardAssistantWorkflow,
} from './dashboard-assistant-step-up';

const assistantEnv = {
  DASHBOARD_ASSISTANT_WORKFLOW_ID: '33',
  DASHBOARD_ASSISTANT_OWNER_ID: 'owner',
  DASHBOARD_ASSISTANT_CHAT_PATH: 'trigger-1791901863127',
};

describe('dashboard assistant step-up', () => {
  it('matches the configured dashboard assistant chat', () => {
    expect(isDashboardAssistantChat(assistantEnv, 33, 'owner', 'trigger-1791901863127')).toBe(true);
    expect(isDashboardAssistantChat(assistantEnv, 33, 'owner', '/trigger-1791901863127')).toBe(true);
    expect(isDashboardAssistantChat(assistantEnv, 34, 'owner', 'trigger-1791901863127')).toBe(false);
    expect(isDashboardAssistantChat({}, 1, 'owner', 'dashboard-assistant')).toBe(true);
    expect(isDashboardAssistantChat({}, 1, 'owner', 'support')).toBe(false);
  });

  it('recognizes the dashboard assistant workflow by id and owner', () => {
    expect(isDashboardAssistantWorkflow(assistantEnv, 33, 'owner')).toBe(true);
    expect(isDashboardAssistantWorkflow(assistantEnv, '33', 'owner')).toBe(true);
    expect(isDashboardAssistantWorkflow(assistantEnv, 34, 'owner')).toBe(false);
    expect(isDashboardAssistantWorkflow(assistantEnv, 33, 'other')).toBe(false);
    expect(isDashboardAssistantWorkflow({}, 33, 'owner')).toBe(false);
  });

  it('embeds the production dashboard assistant instead of hosting a public chat page', () => {
    expect(dashboardAssistantEmbeddedChat('production', true, 'hostedChat')).toBe(true);
    expect(dashboardAssistantEmbeddedChat('test', true, 'hostedChat')).toBe(false);
    expect(dashboardAssistantEmbeddedChat('production', false, 'webhook')).toBe(true);
    expect(dashboardAssistantEmbeddedChat('production', false, 'hostedChat')).toBe(false);
  });

  it('refuses a dashboard assistant turn that has no signed-in user', async () => {
    const denied = await dashboardAssistantStepUpDenied({} as never, 'USER_DO', '  ');
    expect(denied).toMatchObject({ status: 401, body: { stepUpRequired: true } });
  });

  it('refuses when step-up storage is not configured', async () => {
    const denied = await dashboardAssistantStepUpDenied(
      { env: {} } as never,
      'USER_DO',
      'admin@example.com',
    );
    expect(denied?.status).toBe(503);
  });
});
