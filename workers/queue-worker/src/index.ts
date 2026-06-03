import { D1DatabaseManager } from "./database";
import { createLogger } from "./shared/logger";

const log = createLogger('queue-worker');

// Cache database manager instance to avoid recreating it on every queue processing
let databaseManager: D1DatabaseManager | null = null;

const getDatabaseManager = async (db: D1Database): Promise<D1DatabaseManager> => {
  if (!databaseManager) {
    databaseManager = new D1DatabaseManager(db);
    await databaseManager.ensureReady();
  }
  return databaseManager;
};

interface ProcessedItem {
  data: any;
  message: Message;
  userId: string;
  table: string;
  recordData: any;
  queueId?: number;
  batchInfo?: {
    userId: string;
    table: string;
    maxId?: number;
    minId?: number;
    [key: string]: any;
  };
  attempt: number;
}

interface CleanupResult {
  success: boolean;
  deletedCount?: number;
  markedCount?: number;
  processedUpTo?: number;
  error?: string;
}

/** Bảng cần xoá khi cleanup (tiết kiệm storage) */
const QUEUE_TABLE_NAMES = [
  "service_usages", "orders", "payments", "refunds", "commissions",
  "workflow_royalties", "workflow_user_stars", "workflow_comments",
];

const SYNC_TABLE_NAMES = [
  ...QUEUE_TABLE_NAMES,
  "services", "vouchers", "versions",
  "users", "sessions", "connections", "subscriptions",
  "api_tokens", "pending_messages",
  "user_mfa", "user_ekyc", "user_did",
  "passkey_credentials", "backup_codes",
  "commission_policies",
  "agent_workflows",
  "payout_beneficiary",
  "earnings_payouts",
];


// Helper functions

const chunkArray = <T>(array: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

const KV_KEY = 'aiagents-hub-system-config';

/** Đọc cấu hình queue_worker từ KV. Có hiệu lực ngay khi admin thiết lập. */
async function getQueueWorkerConfig(env: Env): Promise<{
  BATCH_SIZE: number;
  MAX_RETRIES: number;
  AE_BATCH_SIZE: number;
  QUEUE_PROCESSING_TIMEOUT: number;
}> {
  const defaults = {
    BATCH_SIZE: parseInt('100', 10),
    MAX_RETRIES: parseInt('3', 10),
    AE_BATCH_SIZE: parseInt('1000', 10),
    QUEUE_PROCESSING_TIMEOUT: parseInt('30000', 10),
  };
  const kv = (env as any).SYSTEM_CONFIG_KV;
  if (!kv) return defaults;
  try {
    const raw = await kv.get(KV_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    const qw = parsed.queue_worker || {};
    return {
      BATCH_SIZE: qw.BATCH_SIZE ?? defaults.BATCH_SIZE,
      MAX_RETRIES: qw.MAX_RETRIES ?? defaults.MAX_RETRIES,
      AE_BATCH_SIZE: qw.AE_BATCH_SIZE ?? defaults.AE_BATCH_SIZE,
      QUEUE_PROCESSING_TIMEOUT: qw.QUEUE_PROCESSING_TIMEOUT ?? defaults.QUEUE_PROCESSING_TIMEOUT,
    };
  } catch {
    return defaults;
  }
}



const cleanupProcessedRecords = async (
  userId: string,
  table: string,
  env: Env,
  cleanupMethod: 'delete' | 'mark' = 'delete',
  upToId: number
): Promise<CleanupResult> => {
  try {
    const doId = env.USER_DO.idFromString(userId);
    const stub = env.USER_DO.get(doId);

    const response = await stub.fetch('https://do.internal/queue/cleanup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table,
        cleanupMethod,
        upToId
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to cleanup records: ${response.status} - ${errorText}`);
    }

    const result = await response.json() as any;

    return {
      success: true,
      deletedCount: result.data?.deletedCount,
      markedCount: result.data?.markedCount,
      processedUpTo: result.data?.processedUpTo
    };
  } catch (error) {
    log.error('queue.cleanup_failed', { userId, table, error });
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

const processChunk = async (
  userId: string,
  table: string,
  chunk: ProcessedItem[],
  database: D1DatabaseManager,
  env: Env
): Promise<void> => {
  try {
    // Get maxId from batchInfo (if available) for cleanup
    const batchInfo = chunk[0]?.batchInfo;
    let maxId = batchInfo?.maxId;
    if (!maxId || maxId <= 0) {
      const queueIds = chunk.map(item => item.queueId || 0).filter(id => id > 0);
      maxId = queueIds.length > 0 ? Math.max(...queueIds) : 0;
    }
    
    // Prepare data array for batch insert (keep original id from message)
    const dataArray = chunk.map(item => item.recordData);
    
    // Batch insert all records into D1 (preserves id from message)
    await database.batchInsertOrUpsertRecords(table, dataArray, userId);

    // Khi cập nhật sessions: nếu session có isActive = false (hết hiệu lực) thì cập nhật connections liên quan thành hết hiệu lực
    if (table === 'sessions') {
      const inactiveSessionIds = dataArray
        .filter((r: any) => {
          const v = r.isActive;
          return v === false || v === 0 || v === '0' || v === 'false';
        })
        .map((r: any) => r.hashSessionId)
        .filter((id: string) => id);
      if (inactiveSessionIds.length > 0) {
        try {
          await database.updateConnectionsBySessionIds(userId, inactiveSessionIds);
        } catch (err) {
          log.error('queue.sessions_connections_update_failed', { userId, error: err });
        }
      }
    }

    // After successful insert, cleanup records from UserDO
    if (maxId > 0) {
      try {
        // First mark as processed
        await cleanupProcessedRecords(userId, table, env, 'mark', maxId);        
      } catch (error) {
        log.error('queue.cleanup_after_insert_failed', { userId, table, maxId, error });
        // Still ack since D1 insert succeeded
      }
    }

    // All successful, ack all messages
    ackAllMessages(chunk);
  } catch (error) {
    log.error('queue.chunk_failed', { userId, table, recordCount: chunk.length, error });
    retryAllMessages(chunk);
  }
};


const ackAllMessages = (chunk: ProcessedItem[]): void => {
  chunk.forEach(item => item.message.ack());
};

const retryAllMessages = (chunk: ProcessedItem[]): void => {
  chunk.forEach(item => item.message.retry());
};


const parseMessage = (message: Message): {
  userId: string;
  table: string;
  recordData: any;
  queueId?: number;
  batchInfo?: any;
}[] | null => {
  try {
		const dataArr = message.body as any[];
		// Kiểm tra nếu không phải array
    if (!Array.isArray(dataArr)) {
      log.warn('queue.parse_invalid_body', { bodyType: typeof message.body });
      return null;
    }
		let returnArr = [];
		for (const item of dataArr) {
			const parsedBody = JSON.parse(item.body);
			const userId = parsedBody.batchInfo?.userId;
			const table = parsedBody.batchInfo?.table || parsedBody.table;
			const recordData = parsedBody.data || parsedBody;
			const queueId = parsedBody.id || recordData.queueId;

			if (!userId || userId === 'unknown') {
				log.warn('queue.parse_missing_user', { table });
				return null;
			}

			if (!SYNC_TABLE_NAMES.includes(table)) {
				log.warn('queue.parse_unknown_table', { table });
				return null;
			}
			returnArr.push({
				userId,
				table,
				recordData,
				queueId: queueId ? (typeof queueId === 'string' ? parseInt(queueId) : queueId) : undefined,
				batchInfo: parsedBody.batchInfo
			});
		}

    return returnArr;
  } catch (error) {
    log.error('queue.parse_failed', error instanceof Error ? error : { error: String(error) });
    return null;
  }
};

const processInputQueue = async (batch: MessageBatch, env: Env): Promise<void> => {
  const config = await getQueueWorkerConfig(env);
  const BATCH_SIZE = config.BATCH_SIZE;
  const database = await getDatabaseManager(env.D1DB);
  const userTableGroups = new Map<string, Map<string, ProcessedItem[]>>();

  // Group messages by userId and table
  for (const message of batch.messages) {
    const parsed = parseMessage(message);
    if (!parsed) {
      message.ack();
      continue;
    }
		for (const parsedItem of parsed) {
			const { userId, table, recordData } = parsedItem;

			if (!userTableGroups.has(userId)) {
				userTableGroups.set(userId, new Map());
			}

			const tableMap = userTableGroups.get(userId)!;
			if (!tableMap.has(table)) {
				tableMap.set(table, []);
			}

			tableMap.get(table)!.push({
				data: { recordData },
				message,
				userId,
				table,
				recordData,
				queueId: parsedItem.queueId,
				batchInfo: parsedItem.batchInfo,
				attempt: 0
			});
		}
  }

  // Process all chunks
  const processingPromises: Promise<void>[] = [];

  for (const [userId, tableMap] of userTableGroups) {
    for (const [table, messages] of tableMap) {
      const chunks = chunkArray(messages, BATCH_SIZE);
      chunks.forEach(chunk => {
        processingPromises.push(processChunk(userId, table, chunk, database, env));
      });
    }
  }

  // Wait for all processing to complete
  const results = await Promise.allSettled(processingPromises);

  // Log results
  const successful = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  log.info('queue.batch_complete', {
    queue: batch.queue,
    messages: batch.messages.length,
    chunksOk: successful,
    chunksFailed: failed,
    userTableGroups: userTableGroups.size,
  });

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      log.error('queue.chunk_rejected', { chunkIndex: index, reason: result.reason });
    }
  });
};

const processErrorQueue = async (batch: MessageBatch, env: Env): Promise<void> => {

  for (const message of batch.messages) {
    try {
      const parsed = parseMessage(message);
      if (!parsed) {
        log.error('queue.dlq_parse_failed', { messageId: message.id });
        message.ack();
        continue;
      }
      for (const parsedItem of parsed) {
        log.error('queue.dlq_entry', {
          messageId: message.id,
          userId: parsedItem.userId,
          table: parsedItem.table,
          queueId: parsedItem.queueId,
        });
      }
      message.ack();
    } catch (error) {
      log.error('queue.dlq_process_failed', { messageId: message.id, error });
      message.ack();
    }
  }
};

// HTTP Handler
const handleHttpRequest = async (req: Request, env: Env): Promise<Response> => {
  const url = new URL(req.url);

  const routes: Record<string, (req: Request) => Promise<Response>> = {
    '/health': async () => new Response(JSON.stringify({
      status: 'healthy',
      service: 'Queue Worker',
      timestamp: Date.now(),
      environment: 'production'
    }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }
    }),

    '/metrics': async () => new Response(JSON.stringify({
      queues: { input: 'aiagents-hub-input-part-0', error: 'aiagents-hub-error-queue-dlq' },
      settings: {
        batch_size: '100',
        max_retries: '3'
      },
      queue_tables: QUEUE_TABLE_NAMES
    }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }
    }),

    '/stats': async () => new Response(JSON.stringify({
      queue_worker: {
        version: '3.0.0',
        timestamp: Date.now(),
        queue_table_count: QUEUE_TABLE_NAMES.length,
        processing_model: 'd1-insert'
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    }),

  };

  const handler = routes[url.pathname];
  if (handler) {
    return await handler(req);
  }

  return new Response('Queue Worker - Available: /health, /metrics, /stats', {
    headers: { 'Content-Type': 'text/plain' }
  });
};

// Main Export
export default {

  async fetch(req: Request, env: Env): Promise<Response> {
    return handleHttpRequest(req, env);
  },

  async queue(batch: MessageBatch, env: Env): Promise<void> {

    const queueHandlers: Record<string, (batch: MessageBatch, env: Env) => Promise<void>> = {
      'aiagents-hub-input-part-0': processInputQueue,
      'aiagents-hub-error-queue-dlq': processErrorQueue
    };

    const handler = queueHandlers[batch.queue];
    if (handler) {
      await handler(batch, env);
    } else {
      log.warn('queue.unknown_queue', { queue: batch.queue, messages: batch.messages.length });
      batch.messages.forEach(msg => msg.ack());
    }
  }
} as ExportedHandler<Env>;
