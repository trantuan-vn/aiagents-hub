import type { SystemConfigData } from "./types";

export interface FieldDef {
  key: string;
  label: string;
  value: number;
  min: number;
  max: number;
}

export function getAuthFields(config: SystemConfigData): FieldDef[] {
  const auth = config.auth_worker ?? {};
  return [
    {
      key: "QUEUE_BATCH_SIZE",
      label: "Queue Batch Size (1-1000)",
      value: auth.QUEUE_BATCH_SIZE ?? 100,
      min: 1,
      max: 1000,
    },
    {
      key: "QUEUE_FLUSH_THRESHOLD",
      label: "Queue Flush Threshold",
      value: auth.QUEUE_FLUSH_THRESHOLD ?? 200,
      min: 1,
      max: 2000,
    },
    {
      key: "QUEUE_FLUSH_INTERVAL",
      label: "Queue Flush Interval (ms)",
      value: auth.QUEUE_FLUSH_INTERVAL ?? 5000,
      min: 1000,
      max: 120000,
    },
    {
      key: "MAX_SEND_FAILURE_COUNT",
      label: "Max Send Failure Count",
      value: auth.MAX_SEND_FAILURE_COUNT ?? 3,
      min: 1,
      max: 10,
    },
    {
      key: "RETRY_ALARM_INTERVAL",
      label: "Retry Alarm Interval (ms)",
      value: auth.RETRY_ALARM_INTERVAL ?? 60000,
      min: 10000,
      max: 300000,
    },
    {
      key: "TOKEN_EXPIRY",
      label: "Token Expiry (seconds)",
      value: auth.TOKEN_EXPIRY ?? 15 * 60,
      min: 60,
      max: 3600,
    },
    {
      key: "REFRESH_TOKEN_EXPIRY",
      label: "Refresh Token Expiry (seconds)",
      value: auth.REFRESH_TOKEN_EXPIRY ?? 4 * 60 * 60,
      min: 300,
      max: 2592000,
    },
    {
      key: "SESSION_EXPIRY",
      label: "Session Expiry (seconds)",
      value: auth.SESSION_EXPIRY ?? 4 * 60 * 60,
      min: 300,
      max: 2592000,
    },
  ];
}

export function getQueueFields(config: SystemConfigData): FieldDef[] {
  const queue = config.queue_worker ?? {};
  return [
    { key: "BATCH_SIZE", label: "Batch Size", value: queue.BATCH_SIZE ?? 100, min: 1, max: 500 },
    { key: "MAX_RETRIES", label: "Max Retries", value: queue.MAX_RETRIES ?? 3, min: 1, max: 10 },
    { key: "AE_BATCH_SIZE", label: "AE Batch Size", value: queue.AE_BATCH_SIZE ?? 1000, min: 100, max: 5000 },
    {
      key: "QUEUE_PROCESSING_TIMEOUT",
      label: "Queue Processing Timeout (ms)",
      value: queue.QUEUE_PROCESSING_TIMEOUT ?? 30000,
      min: 5000,
      max: 120000,
    },
  ];
}

export function getBillingFields(config: SystemConfigData): FieldDef[] {
  const b = config.billing ?? {};
  return [
    {
      key: "MIN_TOP_UP_VND",
      label: "Minimum wallet top-up (VND)",
      value: b.MIN_TOP_UP_VND ?? 1000,
      min: 1,
      max: 100000000,
    },
    {
      key: "WORKFLOW_ROYALTY_PERCENT",
      label: "Workflow sharing royalty (%)",
      value: b.WORKFLOW_ROYALTY_PERCENT ?? 5,
      min: 0,
      max: 100,
    },
    {
      key: "SERVICE_FEE_MARKUP_PERCENT",
      label: "Service fee markup on Cloudflare (%, seed only)",
      value: b.SERVICE_FEE_MARKUP_PERCENT ?? 0,
      min: 0,
      max: 500,
    },
    {
      key: "CREDIT_PRICE_USD",
      label: "Credit price (USD, SSOT — do not change for Cloudflare hikes)",
      value: b.CREDIT_PRICE_USD ?? 0.0077,
      min: 0.0001,
      max: 1,
    },
    {
      key: "INFRA_BUFFER_PCT",
      label: "Infra buffer (%)",
      value: b.INFRA_BUFFER_PCT ?? 12,
      min: 0,
      max: 50,
    },
    {
      key: "CREDIT_EXPIRY_DAYS",
      label: "Purchased Credit expiry (days)",
      value: b.CREDIT_EXPIRY_DAYS ?? 365,
      min: 1,
      max: 3650,
    },
    {
      key: "TARGET_CONTRIBUTION_TINY_PCT",
      label: "Target contribution tiny (%)",
      value: b.TARGET_CONTRIBUTION_TINY_PCT ?? 65,
      min: 0,
      max: 95,
    },
    {
      key: "TARGET_CONTRIBUTION_MID_PCT",
      label: "Target contribution mid (%)",
      value: b.TARGET_CONTRIBUTION_MID_PCT ?? 52,
      min: 0,
      max: 95,
    },
    {
      key: "TARGET_CONTRIBUTION_FRONTIER_PCT",
      label: "Target contribution frontier (%)",
      value: b.TARGET_CONTRIBUTION_FRONTIER_PCT ?? 38,
      min: 0,
      max: 95,
    },
    {
      key: "PAYMENT_FEE_PCT",
      label: "Prepaid payment fee (%)",
      value: b.PAYMENT_FEE_PCT ?? 2,
      min: 0,
      max: 20,
    },
    {
      key: "COEFF_NOTIFY_CHANGE_PCT",
      label: "Coeff notify threshold (%)",
      value: b.COEFF_NOTIFY_CHANGE_PCT ?? 10,
      min: 0,
      max: 100,
    },
    {
      key: "COEFF_NOTIFY_LEAD_DAYS_PRO",
      label: "Coeff notice lead days (Pro)",
      value: b.COEFF_NOTIFY_LEAD_DAYS_PRO ?? 7,
      min: 0,
      max: 90,
    },
    {
      key: "COEFF_NOTIFY_LEAD_DAYS_ENT",
      label: "Coeff notice lead days (Enterprise)",
      value: b.COEFF_NOTIFY_LEAD_DAYS_ENT ?? 30,
      min: 0,
      max: 90,
    },
    {
      key: "MAX_CREDIT_BALANCE_PRO",
      label: "Pro wallet cap (Credits)",
      value: b.MAX_CREDIT_BALANCE_PRO ?? 0,
      min: 0,
      max: 10_000_000,
    },
    {
      key: "INCLUDED_COGS_USD_CAP",
      label: "Included Credit COGS cap (USD)",
      value: b.INCLUDED_COGS_USD_CAP ?? 0,
      min: 0,
      max: 1_000_000,
    },
    {
      key: "FX_RELIST_THRESHOLD_PCT",
      label: "FX relist threshold (%)",
      value: b.FX_RELIST_THRESHOLD_PCT ?? 10,
      min: 0,
      max: 100,
    },
    {
      key: "FLOOR_CONTRIBUTION_TINY_PCT",
      label: "Floor contribution tiny (%)",
      value: b.FLOOR_CONTRIBUTION_TINY_PCT ?? 50,
      min: 0,
      max: 95,
    },
    {
      key: "FLOOR_CONTRIBUTION_MID_PCT",
      label: "Floor contribution mid (%)",
      value: b.FLOOR_CONTRIBUTION_MID_PCT ?? 40,
      min: 0,
      max: 95,
    },
    {
      key: "FLOOR_CONTRIBUTION_FRONTIER_PCT",
      label: "Floor contribution frontier (%)",
      value: b.FLOOR_CONTRIBUTION_FRONTIER_PCT ?? 30,
      min: 0,
      max: 95,
    },
  ];
}

export function getD1tor2Fields(config: SystemConfigData): FieldDef[] {
  const dc = config.d1tor2_cron ?? {};
  return [
    {
      key: "PIPELINE_CONCURRENCY_LIMIT",
      label: "Pipeline Concurrency Limit",
      value: dc.PIPELINE_CONCURRENCY_LIMIT ?? 5,
      min: 1,
      max: 20,
    },
    {
      key: "BATCH_CONCURRENCY_LIMIT",
      label: "Batch Concurrency Limit",
      value: dc.BATCH_CONCURRENCY_LIMIT ?? 3,
      min: 1,
      max: 20,
    },
    { key: "D1_RETENTION_DAYS", label: "D1 Retention Days", value: dc.D1_RETENTION_DAYS ?? 96, min: 1, max: 365 },
  ];
}
