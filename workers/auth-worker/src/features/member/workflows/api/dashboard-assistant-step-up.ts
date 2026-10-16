import type { Context } from 'hono';

import {
  isSensitiveActionUnlockedForAny,
  resolveAvailableStepUpMethods,
} from '../../../auth/strong-auth-policy';

export const DASHBOARD_ASSISTANT_CHAT_PATH = 'dashboard-assistant';

type DashboardAssistantEnv = {
  DASHBOARD_ASSISTANT_WORKFLOW_ID?: string;
  DASHBOARD_ASSISTANT_OWNER_ID?: string;
  DASHBOARD_ASSISTANT_CHAT_PATH?: string;
};

/** The published dashboard assistant, identified like the support chat. */
export function isDashboardAssistantChat(
  env: DashboardAssistantEnv,
  workflowId: number,
  ownerId: string,
  chatPath: string,
): boolean {
  const path = chatPath.trim().replace(/^\/+/, '');
  const expectedId = String(env.DASHBOARD_ASSISTANT_WORKFLOW_ID ?? '').trim();
  const expectedOwner = String(env.DASHBOARD_ASSISTANT_OWNER_ID ?? '').trim();
  const expectedPath = String(env.DASHBOARD_ASSISTANT_CHAT_PATH ?? '').trim().replace(/^\/+/, '');
  if (expectedId && expectedOwner && expectedPath) {
    return String(workflowId) === expectedId && ownerId === expectedOwner && path === expectedPath;
  }
  return path.toLowerCase() === DASHBOARD_ASSISTANT_CHAT_PATH;
}

/** Fresh step-up is required before the signed-in dashboard assistant can run. */
export async function dashboardAssistantStepUpDenied(
  c: Context,
  bindingName: string,
  identifier: string,
): Promise<{ status: 401 | 403 | 503; body: Record<string, unknown> } | null> {
  const session = identifier.trim();
  if (!session) {
    return {
      status: 401,
      body: { error: 'Authentication required', stepUpRequired: true, auth: 'hub_users' },
    };
  }
  const kv = c.env.NONCE_KV;
  if (!kv) {
    return { status: 503, body: { error: 'Step-up verification is unavailable' } };
  }
  const availableMethods = await resolveAvailableStepUpMethods(c, bindingName, session);
  const unlocked = await isSensitiveActionUnlockedForAny(kv, session, availableMethods);
  if (unlocked) return null;
  return {
    status: 403,
    body: {
      error: 'Sensitive action requires step-up verification',
      stepUpRequired: true,
      availableMethods,
      requiredMethod: availableMethods[0] ?? 'otp_email',
    },
  };
}
