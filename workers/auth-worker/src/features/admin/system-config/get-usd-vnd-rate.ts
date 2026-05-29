import { DEFAULT_BILLING_CONFIG, KV_KEY, type SystemConfig } from './domain';
import { getUsdSellRate } from '../exchange-rate/get-rate';

export type MemberBillingParams = {
	usdVndRate: number;
	minTopUpVnd: number;
};

/** Min top-up từ KV; tỉ giá lấy live từ Vietcombank (user nạp tiền → tỷ giá bán). */
export async function getMemberBillingParamsFromEnv(
	env: { SYSTEM_CONFIG_KV?: KVNamespace; USER_DO?: DurableObjectNamespace },
	bindingName: string = 'USER_DO',
): Promise<MemberBillingParams> {
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
	const usdVndRate = await getUsdSellRate(env);
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

/** VND per 1 USD — tỷ giá bán hiện tại của Vietcombank (dùng cho luồng nạp tiền). */
export async function getUsdVndRateFromEnv(
	env: Env,
	_bindingName: string = 'USER_DO',
): Promise<number> {
	return getUsdSellRate(env);
}
