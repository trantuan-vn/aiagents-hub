import { createAgentUIStreamResponse } from 'ai';
import { Hono } from 'hono';

import { requireAuth } from '../auth/authMiddleware';
import { handleError } from '../../shared/utils';
import { createAssistantApplicationService } from './application';

export function createAssistantRoutes(bindingName: string) {
  const app = new Hono<{ Bindings: Env }>();

  app.post('/chat', async (c: any) => {
    try {
      const user = requireAuth(c);

      if (!c.env.AI) {
        return c.json({ error: 'AI binding is not configured' }, 500);
      }

      const body = await c.req.json();
      const messages = body?.messages;
      if (!Array.isArray(messages)) {
        return c.json({ error: 'Expected { messages: UIMessage[] }' }, 400);
      }

      const agent = createAssistantApplicationService(c, bindingName, user);

      return await createAgentUIStreamResponse({
        agent,
        uiMessages: messages,
      });
    } catch (error) {
      const { errorResponse, status } = await handleError(c, error, 'Failed to process assistant chat');
      return c.json(errorResponse, status);
    }
  });

  return app;
}
