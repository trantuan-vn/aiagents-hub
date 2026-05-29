/**
 * USD/VND exchange rates from Vietcombank's public API.
 *
 * - user nạp tiền (USD → VND để thu tiền)  → dùng tỷ giá BÁN ("sell")
 * - admin trả USD cho user (USD → VND để chi trả) → dùng tỷ giá MUA chuyển khoản ("transfer")
 */

const VCB_EXCHANGE_RATE_API = 'https://www.vietcombank.com.vn/api/exchangerates';
const RATE_CACHE_TTL_SECONDS = 60 * 30; // 30 phút
const MAX_FALLBACK_DAYS = 7;

/** Tỉ giá mặc định khi không gọi được API (VND / 1 USD). */
export const DEFAULT_USD_VND_RATE = 26000;

/** Ngày hiện tại dạng YYYY-MM-DD theo giờ Việt Nam (UTC+7) — khớp với Vietcombank. */
export function todayDateString(): string {
  const vn = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return `${vn.getUTCFullYear()}-${String(vn.getUTCMonth() + 1).padStart(2, '0')}-${String(vn.getUTCDate()).padStart(2, '0')}`;
}

export type UsdVndRates = {
  /** Tỷ giá bán (VND / 1 USD) — dùng khi user nạp tiền. */
  sell: number;
  /** Tỷ giá mua chuyển khoản (VND / 1 USD) — dùng khi admin trả USD cho user. */
  transfer: number;
};

type CacheLike = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
};

function resolveCache(env: unknown): CacheLike | undefined {
  const kv = (env as { SYSTEM_CONFIG_KV?: CacheLike } | undefined)?.SYSTEM_CONFIG_KV;
  return kv && typeof kv.get === 'function' && typeof kv.put === 'function' ? kv : undefined;
}

function parseUsdRates(payload: unknown): UsdVndRates | null {
  if (!payload || typeof payload !== 'object') return null;
  const data = (payload as { Data?: unknown }).Data;
  if (!Array.isArray(data)) return null;
  const usd = data.find(
    (r) => r && typeof r === 'object' && (r as { currencyCode?: unknown }).currencyCode === 'USD',
  ) as { sell?: unknown; transfer?: unknown } | undefined;
  if (!usd) return null;
  const sell = Number(usd.sell);
  if (!Number.isFinite(sell) || sell < 1) return null;
  const transfer = Number(usd.transfer);
  return { sell, transfer: Number.isFinite(transfer) && transfer >= 1 ? transfer : sell };
}

async function fetchRatesForExactDate(date: string): Promise<UsdVndRates | null> {
  try {
    const res = await fetch(`${VCB_EXCHANGE_RATE_API}?date=${date}`, {
      headers: { accept: 'application/json', 'user-agent': 'aiagents-hub/1.0' },
    });
    if (!res.ok) return null;
    return parseUsdRates(await res.json());
  } catch {
    return null;
  }
}

function previousDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Tỷ giá USD (bán + mua chuyển khoản) cho một ngày: lấy đúng ngày, nếu chưa có
 * (cuối tuần/lễ) thì lùi tối đa 7 ngày. Kết quả được cache trong KV ~30 phút.
 */
export async function fetchVietcombankUsdRates(
  env: unknown,
  date: string = todayDateString(),
): Promise<UsdVndRates> {
  const cache = resolveCache(env);
  const cacheKey = `vcb_usd_rate:${date}`;
  if (cache) {
    const cached = await cache.get(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as UsdVndRates;
        if (parsed && parsed.sell >= 1 && parsed.transfer >= 1) return parsed;
      } catch {
        /* ignore corrupted cache */
      }
    }
  }

  let cursor = date;
  for (let i = 0; i < MAX_FALLBACK_DAYS; i++) {
    const rates = await fetchRatesForExactDate(cursor);
    if (rates) {
      if (cache) {
        await cache.put(cacheKey, JSON.stringify(rates), { expirationTtl: RATE_CACHE_TTL_SECONDS });
      }
      return rates;
    }
    cursor = previousDate(cursor);
  }
  return { sell: DEFAULT_USD_VND_RATE, transfer: DEFAULT_USD_VND_RATE };
}

/** Tỷ giá BÁN — user nạp tiền (quy đổi USD → VND để thu tiền). */
export async function getUsdSellRate(env: unknown, date: string = todayDateString()): Promise<number> {
  const { sell } = await fetchVietcombankUsdRates(env, date);
  return sell;
}

/** Tỷ giá MUA chuyển khoản — admin trả USD cho user (quy đổi USD → VND để chi trả). */
export async function getUsdTransferRate(env: unknown, date: string = todayDateString()): Promise<number> {
  const { transfer } = await fetchVietcombankUsdRates(env, date);
  return transfer;
}

/**
 * Tương thích ngược cho các luồng nạp tiền/hoa hồng: trả về tỷ giá BÁN.
 * `bindingName` không còn dùng (giữ chữ ký để tránh sửa nhiều nơi gọi).
 */
export async function getUsdVndRateFromEnv(env: unknown, _bindingName?: string): Promise<number> {
  return getUsdSellRate(env);
}
