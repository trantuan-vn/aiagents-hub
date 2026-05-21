import { createAgentUIStreamResponse } from 'ai';
import { Hono } from 'hono';

import { requireAuth } from '../auth/authMiddleware';
import { handleError } from '../../shared/utils';
import { createAssistantApplicationService } from './application';

function extractLatestUserMessageText(messages: unknown[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i] as { role?: unknown; parts?: unknown; content?: unknown } | undefined;
    if (!message || message.role !== 'user') continue;

    if (Array.isArray(message.parts)) {
      const textParts = message.parts
        .map((part) => {
          if (!part || typeof part !== 'object') return '';
          const candidate = part as { type?: unknown; text?: unknown };
          return candidate.type === 'text' && typeof candidate.text === 'string' ? candidate.text : '';
        })
        .filter(Boolean);
      if (textParts.length > 0) return textParts.join('\n').trim();
    }

    if (typeof message.content === 'string') return message.content.trim();
  }

  return '';
}

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

      const latestUserMessageText = extractLatestUserMessageText(messages);
      const agent = await createAssistantApplicationService(c, bindingName, user, latestUserMessageText);

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
