/**
 * UserDO endpoints - tra cứu thông tin
 *
 * Gọi qua userDO.fetch('https://user.do<path>') hoặc qua HTTP API (presentation)
 * Cần có UserDO stub từ env.USER_DO.get(env.USER_DO.idFromName(hashedIdentifier))
 */

export const USER_DO_ENDPOINTS = {
  /** WebSocket status */
  STATUS: '/status',

  /** Danh sách subscriptions */
  SUBSCRIPTIONS: '/subscriptions',

  /** Dynamic CRUD */
  DYNAMIC_INSERT: '/dynamic/insert',
  DYNAMIC_UPDATE: '/dynamic/update',
  DYNAMIC_UPSERT: '/dynamic/upsert',
  DYNAMIC_DELETE: '/dynamic/delete',
  DYNAMIC_SELECT: '/dynamic/select',
  DYNAMIC_BATCH_INSERT: '/dynamic/batch-insert',
  DYNAMIC_MULTI_TABLE: '/dynamic/multi-table',

  /** Queue */
  QUEUE_RECORD: '/queue/record',
  QUEUE_FLUSH: '/queue/flush',
  QUEUE_STATS: '/queue/stats',
  QUEUE_HEALTH: '/queue/health',
  QUEUE_CLEANUP: '/queue/cleanup',

  /** Debug - tra cứu thông tin */
  DEBUG_ID_COUNTERS: '/debug/id-counters',
} as const;

/**
 * Mô tả chi tiết các endpoint tra cứu thông tin
 */
export const ENDPOINT_DESCRIPTIONS: Record<string, { method: string; description: string }> = {
  [USER_DO_ENDPOINTS.STATUS]: {
    method: 'GET',
    description: 'Trạng thái WebSocket connection',
  },
  [USER_DO_ENDPOINTS.SUBSCRIPTIONS]: {
    method: 'GET',
    description: 'Danh sách subscriptions đang active',
  },
  [USER_DO_ENDPOINTS.QUEUE_STATS]: {
    method: 'GET',
    description: 'Thống kê queue theo bảng: pending, flushed, processed count và maxId',
  },
  [USER_DO_ENDPOINTS.QUEUE_HEALTH]: {
    method: 'GET',
    description: 'Health check queue: tổng pending, processed, unhealthy tables',
  },
  [USER_DO_ENDPOINTS.DEBUG_ID_COUNTERS]: {
    method: 'GET',
    description:
      'Tất cả ID counters (tableName và tableName_queue). Số tiếp theo = value + 1. Key [table]_queue = counter cho queueId',
  },
};

/** HTTP API routes (presentation layer) - cần auth */
export const PRESENTATION_ROUTES = {
  /** GET /dashboard/ws/debug/id-counters - Tra cứu ID counters (requireAuth) */
  DEBUG_ID_COUNTERS: '/debug/id-counters',
} as const;
