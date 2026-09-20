import { Hono } from 'hono';
import { requireAdmin, requireAuth } from '../../auth/authMiddleware';
import { handleError } from '../../../shared/utils';
import {
	SystemConfigSchema,
	DEFAULT_AUTH_CONFIG,
	DEFAULT_QUEUE_CONFIG,
	DEFAULT_D1TOR2_CONFIG,
	DEFAULT_BILLING_CONFIG,
	DEFAULT_MARKETING_CONFIG,
	KV_KEY,
	type SystemConfig,
} from './domain';
import { readSystemConfigText, rememberSystemConfigText } from './read-cached';

function defaultSystemConfig(): SystemConfig {
	return {
		auth_worker: DEFAULT_AUTH_CONFIG,
		queue_worker: DEFAULT_QUEUE_CONFIG,
		d1tor2_cron: DEFAULT_D1TOR2_CONFIG,
		billing: DEFAULT_BILLING_CONFIG,
		marketing: DEFAULT_MARKETING_CONFIG,
	};
}

function mergeSystemConfig(parsed: Partial<SystemConfig> | Record<string, unknown>): SystemConfig {
	const p = parsed as Partial<SystemConfig>;
	return {
		auth_worker: { ...DEFAULT_AUTH_CONFIG, ...(p.auth_worker || {}) },
		queue_worker: { ...DEFAULT_QUEUE_CONFIG, ...(p.queue_worker || {}) },
		d1tor2_cron: { ...DEFAULT_D1TOR2_CONFIG, ...(p.d1tor2_cron || {}) },
		billing: { ...DEFAULT_BILLING_CONFIG, ...(p.billing || {}) },
		marketing: { ...DEFAULT_MARKETING_CONFIG, ...(p.marketing || {}) },
	};
}

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
			return c.json({ success: true, data: defaultSystemConfig() });
		}
		const raw = await readSystemConfigText(kv);
		if (!raw) {
			return c.json({ success: true, data: defaultSystemConfig() });
		}
		try {
			const parsed = JSON.parse(raw);
			return c.json({ success: true, data: mergeSystemConfig(parsed) });
		} catch {
			return c.json({ success: true, data: defaultSystemConfig() });
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
		let existing: Record<string, unknown> = {};
		try {
			const raw = await readSystemConfigText(kv);
			if (raw) existing = JSON.parse(raw) as Record<string, unknown>;
		} catch {
			existing = {};
		}
		const merged = mergeSystemConfig({
			...existing,
			...validated,
			auth_worker: { ...(existing.auth_worker as object | undefined), ...validated.auth_worker },
			queue_worker: { ...(existing.queue_worker as object | undefined), ...validated.queue_worker },
			d1tor2_cron: { ...(existing.d1tor2_cron as object | undefined), ...validated.d1tor2_cron },
			billing: { ...(existing.billing as object | undefined), ...validated.billing },
			marketing: { ...(existing.marketing as object | undefined), ...validated.marketing },
		});
		await kv.put(KV_KEY, JSON.stringify(merged));
		rememberSystemConfigText(JSON.stringify(merged));
		return c.json({ success: true, message: 'Config saved. Changes take effect immediately.', data: merged });
	}, 'Failed to save system config', true));

	return app;
}
