import { Hono } from 'hono';
import { requireAuth, requireAdmin } from '../../features/auth/authMiddleware';
import { requirePermissions } from '../../features/member/token/authMiddleware';
import { createWebsocketApplicationService } from './application';
import { handleError } from '../../shared/utils';

export function createDashboardWebSocketRoutes(bindingName: string) {
  const app = new Hono<{ Bindings: Env }>();

  // WebSocket connection endpoint
  app.get('/connect', async (c) => {
    try {
      const user = requireAuth(c);
      const wsApplicationService = createWebsocketApplicationService(c, bindingName);
      return wsApplicationService.connectWebSocketUseCase(user.identifier);

    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, "Failed to connect WebSocket");
      return c.json(errorResponse, status);
    }
  });

  // Broadcast message to all connected WebSocket clients (admin only)
  app.post('/broadcast', async (c) => {
    try {
      const user = requireAuth(c);
      if (user.role !== 'admin') {
        throw new Error('Unauthorized');
      }
      const body = (await c.req.json()) as Record<string, unknown>;
      let finalBody = body;
      // Resolve targetIdentifiers (emails) to targetUsers (DO ids) for BroadcastServiceDO
      const targetIdentifiers = body.targetIdentifiers as string[] | undefined;
      if (Array.isArray(targetIdentifiers) && targetIdentifiers.length > 0) {
        const userDOBinding = (c.env as unknown as Record<string, DurableObjectNamespace>)[bindingName];
        const targetUsers = targetIdentifiers
          .map((id) => String(id).trim())
          .filter(Boolean)
          .map((identifier) => userDOBinding.idFromName(identifier).toString());
        finalBody = { ...body, targetUsers, targetIdentifiers: undefined };
      }
      const request = new Request(c.req.raw.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalBody),
      });
      const wsApplicationService = createWebsocketApplicationService(c, bindingName);
      return wsApplicationService.broadcastMessageUseCase(request);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, "Broadcast failed");
      return c.json(errorResponse, status);
    }
  });

  // Push message to ws-broadcast-queue (admin only, same as API but with session auth)
  app.post('/queue/push', async (c) => {
    try {
      const user = requireAuth(c);
      if (user.role !== 'admin') {
        throw new Error('Unauthorized');
      }
      const body = await c.req.json<{ type?: string; targetUsers?: string[]; targetIdentifiers?: string[]; message: unknown }>();
      const { type = 'broadcast', targetUsers: rawTargetUsers, targetIdentifiers, message } = body;

      let targetUsers: string[];
      if (Array.isArray(targetIdentifiers) && targetIdentifiers.length > 0) {
        const userDOBinding = (c.env as unknown as Record<string, DurableObjectNamespace>)[bindingName];
        targetUsers = targetIdentifiers
          .map((id) => String(id).trim())
          .filter(Boolean)
          .map((identifier) => userDOBinding.idFromName(identifier).toString());
      } else if (Array.isArray(rawTargetUsers) && rawTargetUsers.length > 0) {
        targetUsers = rawTargetUsers;
      } else {
        return c.json({ success: false, error: 'targetUsers or targetIdentifiers is required and must be non-empty' }, 400);
      }

      const queue = c.env.WS_BROADCAST_QUEUE;
      if (!queue) {
        return c.json({ success: false, error: 'WS_BROADCAST_QUEUE not configured' }, 503);
      }

      await queue.send({
        type: type ?? 'broadcast',
        targetUsers,
        message: message ?? body,
      });

      return c.json({ success: true, queued: true, targetCount: targetUsers.length });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to push message to queue');
      return c.json(errorResponse, status);
    }
  });

  // Debug: tra cứu ID counters (tableName và tableName_queue)
  app.get('/debug/id-counters', async (c) => {
    try {
      const user = requireAuth(c);
      const wsApplicationService = createWebsocketApplicationService(c, bindingName);
      return wsApplicationService.getDebugIdCountersUseCase(user.identifier);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, "Failed to get id-counters");
      return c.json(errorResponse, status);
    }
  });

  // Xoá table_state_${tableName} khỏi storage (admin only)
  app.get('/queue/table-state-reset', async (c) => {
    try {
      const user = requireAuth(c);
      const tableName = c.req.query('tableName');
      if (!tableName) {
        return c.json({ success: false, error: 'tableName is required' }, 400);
      }
      const wsApplicationService = createWebsocketApplicationService(c, bindingName);
      return wsApplicationService.deleteTableStateUseCase(user.identifier, tableName);
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, "Failed to reset table state");
      return c.json(errorResponse, status);
    }
  });

  return app;
}

export function createApiWebSocketRoutes(bindingName: string) {
  const app = new Hono<{ Bindings: Env }>();

  // WebSocket connection endpoint
  app.get('/connect', async (c) => {
    try {
      const token = requirePermissions(c, ['websocket:connect']);
      const wsApplicationService = createWebsocketApplicationService(c, bindingName);
      return wsApplicationService.connectWebSocketUseCase(token.identifier);

    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, "Failed to connect WebSocket");
      return c.json(errorResponse, status);
    }
  });

  // Push message to ws-broadcast-queue (consumer-worker sẽ xử lý và gọi UserShardDO)
  app.post('/queue/push', async (c) => {
    try {
      requirePermissions(c, ['websocket:broadcast']);
      const body = await c.req.json<{ type?: string; targetUsers: string[]; message: unknown }>();
      const { type = 'broadcast', targetUsers, message } = body;

      if (!Array.isArray(targetUsers) || targetUsers.length === 0) {
        return c.json({ success: false, error: 'targetUsers is required and must be non-empty' }, 400);
      }

      const queue = c.env.WS_BROADCAST_QUEUE;
      if (!queue) {
        return c.json({ success: false, error: 'WS_BROADCAST_QUEUE not configured' }, 503);
      }

      await queue.send({
        type: type ?? 'broadcast',
        targetUsers,
        message: message ?? body,
      });

      return c.json({ success: true, queued: true, targetCount: targetUsers.length });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Failed to push message to queue');
      return c.json(errorResponse, status);
    }
  });

  return app;
}