import { Context } from 'hono';

import { createAssistantAgent } from './agent';

export async function createAssistantApplicationService(
  c: Context,
  bindingName: string,
  user: any,
  latestUserMessageText = '',
) {
  return createAssistantAgent(c, bindingName, user, latestUserMessageText);
}
