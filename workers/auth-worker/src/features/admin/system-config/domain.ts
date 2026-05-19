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

/** Billing / ví (tỉ giá hiển thị USD ↔ VND khi tạo lệnh nạp) */
export const BillingConfigSchema = z.object({
	/** Số VND tương đương 1 USD (dùng UI preset & quy đổi, VNPay vẫn VND) */
	USD_VND_RATE: z.number().min(1).max(10000000).optional(),
	/** Số tiền nạp tối thiểu mỗi lệnh (VND, số nguyên ≥ 1) */
	MIN_TOP_UP_VND: z.number().int().min(1).max(100000000).optional(),
	/** % phí chia cho chủ workflow khi user khác dùng workflow sharing (mặc định 5) */
	WORKFLOW_ROYALTY_PERCENT: z.number().min(0).max(100).optional(),
});
export type BillingConfig = z.infer<typeof BillingConfigSchema>;

/** Toàn bộ cấu hình hệ thống */
export const SystemConfigSchema = z.object({
	auth_worker: AuthWorkerConfigSchema.optional(),
	queue_worker: QueueWorkerConfigSchema.optional(),
	d1tor2_cron: D1tor2CronConfigSchema.optional(),
	billing: BillingConfigSchema.optional(),
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
	USD_VND_RATE: 26000,
	MIN_TOP_UP_VND: 1000,
	WORKFLOW_ROYALTY_PERCENT: 5,
};

export const KV_KEY = 'aiagents-hub-system-config';
