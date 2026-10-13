import { Hono } from 'hono';

export function createAssistantRoutes(_bindingName: string) {
  const app = new Hono<{ Bindings: Env }>();

  app.post('/chat', (c) => {
    return c.json(
      {
        error:
          'Dashboard assistant chat is disabled. Send messages to the published workflow chat trigger so each turn is billed in credits.',
        code: 'ASSISTANT_WORKFLOW_REQUIRED',
      },
      410,
    );
  });

  return app;
}
