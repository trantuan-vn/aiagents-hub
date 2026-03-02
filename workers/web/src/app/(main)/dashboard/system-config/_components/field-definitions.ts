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
