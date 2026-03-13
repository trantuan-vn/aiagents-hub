import { DEFAULT_AUTH_CONFIG, KV_KEY } from './domain';
import { AUTH_CONSTANTS } from '../../auth/constant';

export interface AuthExpiryConfig {
	tokenExpiry: number;
	refreshTokenExpiry: number;
	sessionExpiry: number;
}

/**
 * Lấy cấu hình thời gian hết hạn từ system config (KV).
 * Fallback về AUTH_CONSTANTS khi KV không có hoặc chưa cấu hình.
 */
export async function getAuthExpiryFromConfig(env: Env): Promise<AuthExpiryConfig> {
	const kv = env.SYSTEM_CONFIG_KV;
	if (!kv) {
		return {
			tokenExpiry: AUTH_CONSTANTS.ACCESS_TOKEN_EXPIRY,
			refreshTokenExpiry: AUTH_CONSTANTS.REFRESH_TOKEN_EXPIRY,
			sessionExpiry: AUTH_CONSTANTS.SESSION_EXPIRY,
		};
	}
	const raw = await kv.get(KV_KEY);
	if (!raw) {
		return {
			tokenExpiry: DEFAULT_AUTH_CONFIG.TOKEN_EXPIRY ?? AUTH_CONSTANTS.ACCESS_TOKEN_EXPIRY,
			refreshTokenExpiry: DEFAULT_AUTH_CONFIG.REFRESH_TOKEN_EXPIRY ?? AUTH_CONSTANTS.REFRESH_TOKEN_EXPIRY,
			sessionExpiry: DEFAULT_AUTH_CONFIG.SESSION_EXPIRY ?? AUTH_CONSTANTS.SESSION_EXPIRY,
		};
	}
	try {
		const parsed = JSON.parse(raw);
		const auth = parsed.auth_worker ?? {};
		return {
			tokenExpiry: auth.TOKEN_EXPIRY ?? DEFAULT_AUTH_CONFIG.TOKEN_EXPIRY ?? AUTH_CONSTANTS.ACCESS_TOKEN_EXPIRY,
			refreshTokenExpiry: auth.REFRESH_TOKEN_EXPIRY ?? DEFAULT_AUTH_CONFIG.REFRESH_TOKEN_EXPIRY ?? AUTH_CONSTANTS.REFRESH_TOKEN_EXPIRY,
			sessionExpiry: auth.SESSION_EXPIRY ?? DEFAULT_AUTH_CONFIG.SESSION_EXPIRY ?? AUTH_CONSTANTS.SESSION_EXPIRY,
		};
	} catch {
		return {
			tokenExpiry: AUTH_CONSTANTS.ACCESS_TOKEN_EXPIRY,
			refreshTokenExpiry: AUTH_CONSTANTS.REFRESH_TOKEN_EXPIRY,
			sessionExpiry: AUTH_CONSTANTS.SESSION_EXPIRY,
		};
	}
}
