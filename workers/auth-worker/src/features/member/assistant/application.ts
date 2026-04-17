import { Context } from 'hono';

import { createAssistantAgent } from './agent';

export function createAssistantApplicationService(c: Context, bindingName: string, user: any) {
  return createAssistantAgent(c, bindingName, user);
}
