import { Hono } from 'hono';
import { requireAdmin, requireAuth } from '../../auth/authMiddleware';
import { handleError } from '../../../shared/utils';
import {
	SystemConfigSchema,
	DEFAULT_AUTH_CONFIG,
	DEFAULT_QUEUE_CONFIG,
	DEFAULT_D1TOR2_CONFIG,
	KV_KEY,
	type SystemConfig,
} from './domain';

export function createSystemConfigRoutes(_bindingName: string) {
	const app = new Hono<{ Bindings: Env }>();

	const createRouteHandler = (
		handler: (c: any, user: any) => Promise<Response>,
		errorMessage: string,
		requireIsAdmin: boolean
	) => {
		return async (c: any) => {
			try {
				const user = requireIsAdmin ? requireAdmin(c) : requireAuth(c);
				return await handler(c, user);
			} catch (e) {
				const { errorResponse, status } = await handleError(c, e, errorMessage);
				return c.json(errorResponse, status);
			}
		};
	};

	// GET - Lấy cấu hình hiện tại (admin only)
	app.get('/', createRouteHandler(async (c) => {
		const kv = c.env.SYSTEM_CONFIG_KV;
		if (!kv) {
			return c.json({
				success: true,
				data: {
					auth_worker: DEFAULT_AUTH_CONFIG,
					queue_worker: DEFAULT_QUEUE_CONFIG,
					d1tor2_cron: DEFAULT_D1TOR2_CONFIG,
				},
			});
		}
		const raw = await kv.get(KV_KEY);
		if (!raw) {
			return c.json({
				success: true,
				data: {
					auth_worker: DEFAULT_AUTH_CONFIG,
					queue_worker: DEFAULT_QUEUE_CONFIG,
					d1tor2_cron: DEFAULT_D1TOR2_CONFIG,
				},
			});
		}
		try {
			const parsed = JSON.parse(raw);
			const merged: SystemConfig = {
				auth_worker: { ...DEFAULT_AUTH_CONFIG, ...(parsed.auth_worker || {}) },
				queue_worker: { ...DEFAULT_QUEUE_CONFIG, ...(parsed.queue_worker || {}) },
				d1tor2_cron: { ...DEFAULT_D1TOR2_CONFIG, ...(parsed.d1tor2_cron || {}) },
			};
			return c.json({ success: true, data: merged });
		} catch {
			return c.json({
				success: true,
				data: {
					auth_worker: DEFAULT_AUTH_CONFIG,
					queue_worker: DEFAULT_QUEUE_CONFIG,
					d1tor2_cron: DEFAULT_D1TOR2_CONFIG,
				},
			});
		}
	}, 'Failed to get system config', true));

	// PUT - Cập nhật cấu hình (admin only)
	app.put('/', createRouteHandler(async (c) => {
		const kv = c.env.SYSTEM_CONFIG_KV;
		if (!kv) {
			return c.json({ success: false, error: 'SYSTEM_CONFIG_KV not configured' }, 500);
		}
		const body = await c.req.json();
		const validated = SystemConfigSchema.parse(body);
		await kv.put(KV_KEY, JSON.stringify(validated));
		return c.json({ success: true, message: 'Config saved. Changes take effect immediately.' });
	}, 'Failed to save system config', true));

	return app;
}
