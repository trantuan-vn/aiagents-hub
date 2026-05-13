import { DEFAULT_BILLING_CONFIG, KV_KEY, type SystemConfig } from './domain';

export type MemberBillingParams = {
	usdVndRate: number;
	minTopUpVnd: number;
};

/** Tỉ giá + số tiền nạp tối thiểu từ KV system config (member UI + validate tạo đơn). */
export async function getMemberBillingParamsFromEnv(env: { SYSTEM_CONFIG_KV?: KVNamespace }): Promise<MemberBillingParams> {
	const defaults = DEFAULT_BILLING_CONFIG;
	let billing = { ...defaults };
	const kv = env.SYSTEM_CONFIG_KV;
	if (kv) {
		const raw = await kv.get(KV_KEY);
		if (raw) {
			try {
				const parsed = JSON.parse(raw) as Partial<SystemConfig>;
				billing = { ...defaults, ...(parsed.billing || {}) };
			} catch {
				/* ignore */
			}
		}
	}
	const usdVndRate =
		typeof billing.USD_VND_RATE === 'number' && !Number.isNaN(billing.USD_VND_RATE) && billing.USD_VND_RATE >= 1
			? billing.USD_VND_RATE
			: (defaults.USD_VND_RATE ?? 26000);
	const rawMin = billing.MIN_TOP_UP_VND;
	const minTopUpVnd =
		typeof rawMin === 'number' &&
		!Number.isNaN(rawMin) &&
		Number.isInteger(rawMin) &&
		rawMin >= 1 &&
		rawMin <= 100000000
			? rawMin
			: (defaults.MIN_TOP_UP_VND ?? 1000);
	return { usdVndRate, minTopUpVnd };
}

/** VND per 1 USD — dùng cho UI nạp tiền & hiển thị (KV system config). */
export async function getUsdVndRateFromEnv(env: { SYSTEM_CONFIG_KV?: KVNamespace }): Promise<number> {
	const { usdVndRate } = await getMemberBillingParamsFromEnv(env);
	return usdVndRate;
}
