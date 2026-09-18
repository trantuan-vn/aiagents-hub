import {
	DEFAULT_MARKETING_CONFIG,
	KV_KEY,
	MARKETING_STATS_ACC_KEY,
	MARKETING_STATS_RUNS_TOTAL_KEY,
	SystemConfigSchema,
	type MarketingConfig,
} from './domain';

export type MarketingAccumulator = {
	usersReal: number;
	runsReal: number;
	lastUsersTotal: number;
	lastRunsTotal: number;
	lastUtcDate: string;
};

export type PublicMarketingStats = {
	users: number;
	workflowRuns: number;
};

function utcDate(now = new Date()): string {
	return now.toISOString().slice(0, 10);
}

function emptyAcc(): MarketingAccumulator {
	return { usersReal: 0, runsReal: 0, lastUsersTotal: 0, lastRunsTotal: 0, lastUtcDate: '' };
}

function parseAcc(raw: unknown): MarketingAccumulator {
	if (!raw || typeof raw !== 'object') return emptyAcc();
	const o = raw as Record<string, unknown>;
	return {
		usersReal: Math.max(0, Math.floor(Number(o.usersReal) || 0)),
		runsReal: Math.max(0, Math.floor(Number(o.runsReal) || 0)),
		lastUsersTotal: Math.max(0, Math.floor(Number(o.lastUsersTotal) || 0)),
		lastRunsTotal: Math.max(0, Math.floor(Number(o.lastRunsTotal) || 0)),
		lastUtcDate: typeof o.lastUtcDate === 'string' ? o.lastUtcDate : '',
	};
}

export function displayedMarketingCount(seed: number, real: number, coeff: number): number {
	const s = Math.max(0, Math.floor(Number(seed) || 0));
	const r = Math.max(0, Number(real) || 0);
	const c = Number.isFinite(coeff) && coeff >= 0 ? coeff : 1;
	return Math.max(0, Math.round(s + r * c));
}

export async function getMarketingConfigFromEnv(env: Env): Promise<MarketingConfig> {
	const fallback = DEFAULT_MARKETING_CONFIG;
	const kv = env.SYSTEM_CONFIG_KV;
	if (!kv) return fallback;
	try {
		const raw = await kv.get(KV_KEY, 'json');
		if (!raw) return fallback;
		const parsed = SystemConfigSchema.safeParse(raw);
		const m = parsed.success ? parsed.data.marketing : undefined;
		return {
			USERS_SEED: m?.USERS_SEED ?? fallback.USERS_SEED,
			WORKFLOW_RUNS_SEED: m?.WORKFLOW_RUNS_SEED ?? fallback.WORKFLOW_RUNS_SEED,
			STATS_COEFF: m?.STATS_COEFF ?? fallback.STATS_COEFF,
		};
	} catch {
		return fallback;
	}
}

export async function bumpMarketingWorkflowRun(env: Env): Promise<void> {
	const kv = env.SYSTEM_CONFIG_KV;
	if (!kv) return;
	try {
		const raw = await kv.get(MARKETING_STATS_RUNS_TOTAL_KEY);
		const n = Math.max(0, Math.floor(Number(raw) || 0));
		await kv.put(MARKETING_STATS_RUNS_TOTAL_KEY, String(n + 1));
	} catch {
		/* marketing counter must not fail a run */
	}
}

async function countUsers(env: Env): Promise<number> {
	const db = env.D1DB;
	if (!db) return 0;
	try {
		const row = await db.prepare(`SELECT COUNT(DISTINCT "user_id") as cnt FROM users`).first<{ cnt: number }>();
		return Math.max(0, Math.floor(Number(row?.cnt) || 0));
	} catch {
		return 0;
	}
}

async function countRunsTotal(env: Env): Promise<number> {
	const kv = env.SYSTEM_CONFIG_KV;
	if (!kv) return 0;
	try {
		const raw = await kv.get(MARKETING_STATS_RUNS_TOTAL_KEY);
		return Math.max(0, Math.floor(Number(raw) || 0));
	} catch {
		return 0;
	}
}

/**
 * Lần đầu chỉ chốt baseline (seed đứng một mình).
 * Mỗi ngày UTC sau đó cộng delta user/run thật vào accumulator.
 */
export function rollupAccumulator(
	acc: MarketingAccumulator,
	currentUsers: number,
	currentRuns: number,
	todayUtc: string,
): MarketingAccumulator {
	if (!acc.lastUtcDate) {
		return {
			usersReal: 0,
			runsReal: 0,
			lastUsersTotal: currentUsers,
			lastRunsTotal: currentRuns,
			lastUtcDate: todayUtc,
		};
	}
	if (acc.lastUtcDate >= todayUtc) return acc;
	return {
		usersReal: acc.usersReal + Math.max(0, currentUsers - acc.lastUsersTotal),
		runsReal: acc.runsReal + Math.max(0, currentRuns - acc.lastRunsTotal),
		lastUsersTotal: currentUsers,
		lastRunsTotal: currentRuns,
		lastUtcDate: todayUtc,
	};
}

export async function rollupMarketingStats(env: Env, now = new Date()): Promise<PublicMarketingStats> {
	const cfg = await getMarketingConfigFromEnv(env);
	const seedUsers = cfg.USERS_SEED ?? DEFAULT_MARKETING_CONFIG.USERS_SEED ?? 0;
	const seedRuns = cfg.WORKFLOW_RUNS_SEED ?? DEFAULT_MARKETING_CONFIG.WORKFLOW_RUNS_SEED ?? 0;
	const coeff = cfg.STATS_COEFF ?? DEFAULT_MARKETING_CONFIG.STATS_COEFF ?? 1;
	const today = utcDate(now);

	const kv = env.SYSTEM_CONFIG_KV;
	let acc = emptyAcc();
	if (kv) {
		try {
			acc = parseAcc(await kv.get(MARKETING_STATS_ACC_KEY, 'json'));
		} catch {
			acc = emptyAcc();
		}
	}

	if (acc.lastUtcDate !== today) {
		const [users, runs] = await Promise.all([countUsers(env), countRunsTotal(env)]);
		acc = rollupAccumulator(acc, users, runs, today);
		if (kv) {
			try {
				await kv.put(MARKETING_STATS_ACC_KEY, JSON.stringify(acc));
			} catch {
				/* ignore */
			}
		}
	}

	return {
		users: displayedMarketingCount(seedUsers, acc.usersReal, coeff),
		workflowRuns: displayedMarketingCount(seedRuns, acc.runsReal, coeff),
	};
}
