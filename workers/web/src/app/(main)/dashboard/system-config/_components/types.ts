export interface AuthWorkerConfig {
  QUEUE_BATCH_SIZE?: number;
  QUEUE_FLUSH_THRESHOLD?: number;
  QUEUE_FLUSH_INTERVAL?: number;
  MAX_SEND_FAILURE_COUNT?: number;
  RETRY_ALARM_INTERVAL?: number;
  /** Thời gian hết hạn Access Token (giây) */
  TOKEN_EXPIRY?: number;
  /** Thời gian hết hạn Refresh Token (giây) */
  REFRESH_TOKEN_EXPIRY?: number;
  /** Thời gian hết hạn Session (giây) */
  SESSION_EXPIRY?: number;
}

export interface QueueWorkerConfig {
  BATCH_SIZE?: number;
  MAX_RETRIES?: number;
  AE_BATCH_SIZE?: number;
  QUEUE_PROCESSING_TIMEOUT?: number;
}

export interface D1tor2CronConfig {
  PIPELINE_CONCURRENCY_LIMIT?: number;
  BATCH_CONCURRENCY_LIMIT?: number;
  D1_RETENTION_DAYS?: number;
}

/** Billing UI — min top-up & workflow royalty (tỉ giá tại Quản lý tỉ giá) */
export interface BillingConfig {
  MIN_TOP_UP_VND?: number;
  WORKFLOW_ROYALTY_PERCENT?: number;
  /** Extra % on Cloudflare cost when scanning services (30 → feePercent 130). */
  SERVICE_FEE_MARKUP_PERCENT?: number;
  CREDIT_PRICE_USD?: number;
  PAYMENT_FEE_PCT?: number;
  INFRA_BUFFER_PCT?: number;
  COEFF_NOTIFY_CHANGE_PCT?: number;
  COEFF_NOTIFY_LEAD_DAYS_PRO?: number;
  COEFF_NOTIFY_LEAD_DAYS_ENT?: number;
  CREDIT_EXPIRY_DAYS?: number;
  MAX_CREDIT_BALANCE_PRO?: number;
  INCLUDED_COGS_USD_CAP?: number;
  BILLING_UNIT?: "usd" | "credit";
  FX_RELIST_THRESHOLD_PCT?: number;
  TARGET_CONTRIBUTION_TINY_PCT?: number;
  TARGET_CONTRIBUTION_MID_PCT?: number;
  TARGET_CONTRIBUTION_FRONTIER_PCT?: number;
  FLOOR_CONTRIBUTION_TINY_PCT?: number;
  FLOOR_CONTRIBUTION_MID_PCT?: number;
  FLOOR_CONTRIBUTION_FRONTIER_PCT?: number;
}

export interface MarketingConfig {
  USERS_SEED?: number;
  WORKFLOW_RUNS_SEED?: number;
  STATS_COEFF?: number;
}

export interface SystemConfigData {
  auth_worker?: AuthWorkerConfig;
  queue_worker?: QueueWorkerConfig;
  d1tor2_cron?: D1tor2CronConfig;
  billing?: BillingConfig;
  marketing?: MarketingConfig;
}
