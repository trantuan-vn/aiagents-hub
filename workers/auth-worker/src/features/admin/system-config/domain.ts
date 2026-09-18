import { z } from 'zod';

/** Cấu hình Auth Worker - Queue parameters cho UserDO + thời gian hết hạn token/session */
export const AuthWorkerConfigSchema = z.object({
	QUEUE_BATCH_SIZE: z.number().int().min(1).max(1000).optional(),
	QUEUE_FLUSH_THRESHOLD: z.number().int().min(1).max(2000).optional(),
	QUEUE_FLUSH_INTERVAL: z.number().int().min(1000).max(120000).optional(),
	MAX_SEND_FAILURE_COUNT: z.number().int().min(1).max(10).optional(),
	RETRY_ALARM_INTERVAL: z.number().int().min(10000).max(300000).optional(),
	/** Thời gian hết hạn Access Token (giây) */
	TOKEN_EXPIRY: z.number().int().min(60).max(3600).optional(),
	/** Thời gian hết hạn Refresh Token (giây) */
	REFRESH_TOKEN_EXPIRY: z.number().int().min(300).max(2592000).optional(),
	/** Thời gian hết hạn Session (giây) */
	SESSION_EXPIRY: z.number().int().min(300).max(2592000).optional(),
});
export type AuthWorkerConfig = z.infer<typeof AuthWorkerConfigSchema>;

/** Cấu hình Queue Worker */
export const QueueWorkerConfigSchema = z.object({
	BATCH_SIZE: z.number().int().min(1).max(500).optional(),
	MAX_RETRIES: z.number().int().min(1).max(10).optional(),
	AE_BATCH_SIZE: z.number().int().min(100).max(5000).optional(),
	QUEUE_PROCESSING_TIMEOUT: z.number().int().min(5000).max(120000).optional(),
});
export type QueueWorkerConfig = z.infer<typeof QueueWorkerConfigSchema>;

/** Cấu hình D1tor2 Cron Worker */
export const D1tor2CronConfigSchema = z.object({
	PIPELINE_CONCURRENCY_LIMIT: z.number().int().min(1).max(20).optional(),
	BATCH_CONCURRENCY_LIMIT: z.number().int().min(1).max(20).optional(),
	D1_RETENTION_DAYS: z.number().int().min(1).max(365).optional(),
});
export type D1tor2CronConfig = z.infer<typeof D1tor2CronConfigSchema>;

export const ModelClassSchema = z.enum(['tiny', 'mid', 'frontier']);
export type ModelClass = z.infer<typeof ModelClassSchema>;

/** Billing / ví (tỉ giá quản lý riêng tại admin → Quản lý tỉ giá) */
export const BillingConfigSchema = z.object({
	/** Số tiền nạp tối thiểu mỗi lệnh (VND, số nguyên ≥ 1) */
	MIN_TOP_UP_VND: z.number().int().min(1).max(100000000).optional(),
	/** % phí chia cho chủ workflow khi user khác dùng workflow sharing (mặc định 5) */
	WORKFLOW_ROYALTY_PERCENT: z.number().min(0).max(100).optional(),
	/** % thu nhập thêm trên giá Cloudflare khi quét sinh service (30 → feePercent 130 trên service) — deprecated seed only */
	SERVICE_FEE_MARKUP_PERCENT: z.number().min(0).max(500).optional(),
	/** usd = legacy token markup; credit = One Credit (default). */
	BILLING_UNIT: z.enum(['usd', 'credit']).optional(),
	/** SSOT nội bộ: USD per Credit. Không đổi vì Cloudflare tăng giá. */
	CREDIT_PRICE_USD: z.number().min(0.0001).max(1).optional(),
	PAYMENT_FEE_PCT: z.number().min(0).max(20).optional(),
	/** Chỉ hạ tầng / retry / support biến đổi — không nhét lãi vào đây. */
	INFRA_BUFFER_PCT: z.number().min(0).max(50).optional(),
	COEFF_NOTIFY_CHANGE_PCT: z.number().min(0).max(100).optional(),
	COEFF_NOTIFY_LEAD_DAYS_PRO: z.number().int().min(0).max(90).optional(),
	COEFF_NOTIFY_LEAD_DAYS_ENT: z.number().int().min(0).max(90).optional(),
	CREDIT_EXPIRY_DAYS: z.number().int().min(1).max(3650).optional(),
	MAX_CREDIT_BALANCE_PRO: z.number().min(0).optional(),
	INCLUDED_COGS_USD_CAP: z.number().min(0).optional(),
	FX_RELIST_THRESHOLD_PCT: z.number().min(0).max(100).optional(),
	TARGET_CONTRIBUTION_TINY_PCT: z.number().min(0).max(95).optional(),
	TARGET_CONTRIBUTION_MID_PCT: z.number().min(0).max(95).optional(),
	TARGET_CONTRIBUTION_FRONTIER_PCT: z.number().min(0).max(95).optional(),
	FLOOR_CONTRIBUTION_TINY_PCT: z.number().min(0).max(95).optional(),
	FLOOR_CONTRIBUTION_MID_PCT: z.number().min(0).max(95).optional(),
	FLOOR_CONTRIBUTION_FRONTIER_PCT: z.number().min(0).max(95).optional(),
});
export type BillingConfig = z.infer<typeof BillingConfigSchema>;

/** Số liệu marketing trang chủ: seed + (số thật hàng ngày × hệ số). Hệ số = 1 khi số thật đã đủ lớn. */
export const MarketingConfigSchema = z.object({
	/** Số user khởi điểm (marketing). */
	USERS_SEED: z.number().int().min(0).max(100_000_000).optional(),
	/** Số lượt chạy workflow khởi điểm (marketing). */
	WORKFLOW_RUNS_SEED: z.number().int().min(0).max(10_000_000_000).optional(),
	/** Nhân số liệu thật cộng dồn mỗi ngày. 1 = phản ánh trung thực. */
	STATS_COEFF: z.number().min(0).max(100).optional(),
});
export type MarketingConfig = z.infer<typeof MarketingConfigSchema>;

/** Toàn bộ cấu hình hệ thống */
export const SystemConfigSchema = z.object({
	auth_worker: AuthWorkerConfigSchema.optional(),
	queue_worker: QueueWorkerConfigSchema.optional(),
	d1tor2_cron: D1tor2CronConfigSchema.optional(),
	billing: BillingConfigSchema.optional(),
	marketing: MarketingConfigSchema.optional(),
});
export type SystemConfig = z.infer<typeof SystemConfigSchema>;

/** Default values từ wrangler vars - TOKEN/REFRESH/SESSION align với AUTH_CONSTANTS */
export const DEFAULT_AUTH_CONFIG: AuthWorkerConfig = {
	QUEUE_BATCH_SIZE: 100,
	QUEUE_FLUSH_THRESHOLD: 200,
	QUEUE_FLUSH_INTERVAL: 5000,
	MAX_SEND_FAILURE_COUNT: 3,
	RETRY_ALARM_INTERVAL: 60000,
	TOKEN_EXPIRY: 15 * 60,
	REFRESH_TOKEN_EXPIRY: 4 * 60 * 60,
	SESSION_EXPIRY: 4 * 60 * 60,
};

export const DEFAULT_QUEUE_CONFIG: QueueWorkerConfig = {
	BATCH_SIZE: 100,
	MAX_RETRIES: 3,
	AE_BATCH_SIZE: 1000,
	QUEUE_PROCESSING_TIMEOUT: 30000,
};

export const DEFAULT_D1TOR2_CONFIG: D1tor2CronConfig = {
	PIPELINE_CONCURRENCY_LIMIT: 5,
	BATCH_CONCURRENCY_LIMIT: 3,
	D1_RETENTION_DAYS: 96,
};

export const DEFAULT_BILLING_CONFIG: BillingConfig = {
	MIN_TOP_UP_VND: 1000,
	WORKFLOW_ROYALTY_PERCENT: 5,
	SERVICE_FEE_MARKUP_PERCENT: 0,
	BILLING_UNIT: 'credit',
	CREDIT_PRICE_USD: 0.0077,
	PAYMENT_FEE_PCT: 2,
	INFRA_BUFFER_PCT: 12,
	COEFF_NOTIFY_CHANGE_PCT: 10,
	COEFF_NOTIFY_LEAD_DAYS_PRO: 7,
	COEFF_NOTIFY_LEAD_DAYS_ENT: 30,
	CREDIT_EXPIRY_DAYS: 365,
	FX_RELIST_THRESHOLD_PCT: 10,
	TARGET_CONTRIBUTION_TINY_PCT: 65,
	TARGET_CONTRIBUTION_MID_PCT: 52,
	TARGET_CONTRIBUTION_FRONTIER_PCT: 38,
	FLOOR_CONTRIBUTION_TINY_PCT: 50,
	FLOOR_CONTRIBUTION_MID_PCT: 40,
	FLOOR_CONTRIBUTION_FRONTIER_PCT: 30,
};

export const DEFAULT_MARKETING_CONFIG: MarketingConfig = {
	USERS_SEED: 18_400,
	WORKFLOW_RUNS_SEED: 3_280_000,
	STATS_COEFF: 8,
};

export const KV_KEY = 'aiagents-hub-system-config';
export const MARKETING_STATS_ACC_KEY = 'aiagents-hub-marketing-stats-acc';
export const MARKETING_STATS_RUNS_TOTAL_KEY = 'aiagents-hub-marketing-runs-total';
