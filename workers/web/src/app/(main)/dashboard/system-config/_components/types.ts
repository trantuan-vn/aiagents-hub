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

export interface SystemConfigData {
  auth_worker?: AuthWorkerConfig;
  queue_worker?: QueueWorkerConfig;
  d1tor2_cron?: D1tor2CronConfig;
}
