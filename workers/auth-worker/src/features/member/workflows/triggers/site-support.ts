type SiteSupportEnv = {
  SITE_SUPPORT_WORKFLOW_ID?: string;
  SITE_SUPPORT_OWNER_ID?: string;
  SITE_SUPPORT_CHAT_PATH?: string;
};

/** True only for the public marketing support composer, not every hosted chat. */
export function isSiteSupportChat(
  env: SiteSupportEnv,
  workflowId: number,
  ownerId: string,
  chatPath: string,
): boolean {
  const expectedId = String(env.SITE_SUPPORT_WORKFLOW_ID ?? '').trim();
  const expectedOwner = String(env.SITE_SUPPORT_OWNER_ID ?? '').trim();
  const expectedPath = String(env.SITE_SUPPORT_CHAT_PATH ?? '').trim().replace(/^\/+/, '');
  if (!expectedId || !expectedOwner || !expectedPath) return false;
  const path = chatPath.trim().replace(/^\/+/, '');
  return String(workflowId) === expectedId && ownerId === expectedOwner && path === expectedPath;
}
