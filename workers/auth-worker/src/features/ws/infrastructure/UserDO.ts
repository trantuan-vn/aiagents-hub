import { DurableObject } from 'cloudflare:workers';
import { z } from 'zod';

import { UserDODatabase, TableOptions } from '../../../shared/database/index.js';
import { getIPAndUserAgent, getSessionIdHash, handleErrorWithoutIp } from '../../../shared/utils.js';

import { 
  ConnectionSchema, PendingMessageSchema, SubscriptionSchema, 
  Subscription, WebSocketMessageSchema,
  DEFAULT_SCALE_CONFIGS, ScaleConfig, UserSchema, SessionSchema,
  PricePolicySchema, ServiceSchema, ServiceUsageSchema, VoucherSchema,
  OrderSchema, OrderItemSchema, OrderItemDiscountSchema, ApiTokenSchema,
  PaymentSchema, RefundSchema, BroadcastValidator, VersionInfoSchema,
  UserMfaSchema, PasskeyCredentialSchema, BackupCodeSchema, UserEkycSchema, UserDidSchema
} from '../domain.js';

const MAX_SEND_FAILURE_COUNT = 3;
const RETRY_ALARM_INTERVAL = 60000;
const QUEUE_FLUSH_INTERVAL = 5000;
const QUEUE_FLUSH_THRESHOLD = 200;

const KV_KEY = 'system_config';

const TableStateSchema = z.object({
  tableName: z.string(),
  lastFlushedId: z.number().int().default(0),
  lastProcessedId: z.number().int().default(0),
  pendingCount: z.number().default(0),
  lastFlushTime: z.number().optional(),
  lastProcessTime: z.number().optional(),
  updatedAt: z.number().default(Date.now)
});

type TableState = z.infer<typeof TableStateSchema>;

export class UserDO extends DurableObject {
  protected state: DurableObjectState;
  protected env: Env;
  protected database: UserDODatabase;
  private scaleConfig: ScaleConfig = DEFAULT_SCALE_CONFIGS['1M+'];
  private sendFailureCount = new WeakMap<WebSocket, number>();
  private sessions = new WeakMap<WebSocket, string>();
  private tableStates = new Map<string, TableState>();
  
  /** Bảng cần xoá record khi cleanup để tiết kiệm không gian lưu trữ */
  private readonly QUEUE_TABLE_NAMES = [
    "service_usages", "orders", "order_items", "order_discounts", 
    "payments", "refunds"
  ];

  /** Bảng danh mục: xử lý giống queue nhưng KHÔNG xoá khi cleanup (giữ lại record) */
  private readonly SYNC_TABLE_NAMES = [
    ...this.QUEUE_TABLE_NAMES,
    "price_policies", "services", "vouchers", "versions",
    "users", "sessions", "connections", "subscriptions",
    "api_tokens", "pending_messages",
    "user_mfa", "user_ekyc", "user_did",
    "passkey_credentials", "backup_codes"
  ];

  private readonly TABLE_CONFIGS = {
    userScoped: { userScoped: true, autoFields: { id: true, timestamps: true, user: true } },
    withUniqueIndex: (conflictField: string) => ({
      userScoped: true,
      uniqueIndexes: [conflictField],
      conflictField,
      autoFields: { id: true, timestamps: true, user: true }
    }),
    queueTable: () => ({
      userScoped: true,
      autoFields: { id: true, timestamps: true, user: true, queue: true }
    }),
    /** Bảng danh mục: queue flow + unique index, nhưng không xoá khi cleanup */
    queueTableWithUniqueIndex: (conflictField: string) => ({
      userScoped: true,
      uniqueIndexes: [conflictField],
      conflictField,
      autoFields: { id: true, timestamps: true, user: true, queue: true }
    })
  };

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.state = state;
    this.env = env;
    this.database = new UserDODatabase(state.storage, this.userId, this.broadcast.bind(this));
    
    this.initializeTables();
  }

  private readonly QUEUE_SCHEMA_EXTENSION = {
    queueId: z.number().int().optional(),
    queueStatus: z.enum(['pending', 'flushed', 'processed']).optional(),
    flushedAt: z.number().optional(),
    processedAt: z.number().optional()
  };

  // ========== INITIALIZATION ==========
  private async initializeTables(): Promise<void> {
    await this.state.blockConcurrencyWhile(async () => {
      const extendWithQueue = <T extends z.ZodObject<any>>(schema: T) =>
        schema.extend(this.QUEUE_SCHEMA_EXTENSION);

      // Bảng danh mục (catalog): queue flow nhưng KHÔNG xoá khi cleanup
      this.table('price_policies', extendWithQueue(PricePolicySchema), this.TABLE_CONFIGS.queueTableWithUniqueIndex('code'));
      this.table('services', extendWithQueue(ServiceSchema), this.TABLE_CONFIGS.queueTableWithUniqueIndex('endpoint'));
      this.table('vouchers', extendWithQueue(VoucherSchema), this.TABLE_CONFIGS.queueTableWithUniqueIndex('code'));
      
      this.table('users', extendWithQueue(UserSchema), this.TABLE_CONFIGS.queueTableWithUniqueIndex('identifier'));
      this.table('sessions', extendWithQueue(SessionSchema), this.TABLE_CONFIGS.queueTableWithUniqueIndex('hashSessionId'));
      this.table('connections', extendWithQueue(ConnectionSchema), this.TABLE_CONFIGS.queueTableWithUniqueIndex('sessionId'));
      this.table('subscriptions', extendWithQueue(SubscriptionSchema), this.TABLE_CONFIGS.queueTableWithUniqueIndex('channel'));
      
      // Queue tables (xoá khi cleanup để tiết kiệm storage)
      const queueSchemas = [
        { name: 'orders', schema: OrderSchema },
        { name: 'service_usages', schema: ServiceUsageSchema },
        { name: 'order_items', schema: OrderItemSchema },
        { name: 'order_discounts', schema: OrderItemDiscountSchema },
        { name: 'payments', schema: PaymentSchema },
        { name: 'refunds', schema: RefundSchema }
      ];
      
      queueSchemas.forEach(({ name, schema }) => {
        this.table(name, extendWithQueue(schema), this.TABLE_CONFIGS.queueTable());
      });
      
      // Bảng danh mục (userScoped, không unique index)
      this.table('api_tokens', extendWithQueue(ApiTokenSchema), this.TABLE_CONFIGS.queueTable());
      this.table('versions', extendWithQueue(VersionInfoSchema), this.TABLE_CONFIGS.queueTable());
      this.table('pending_messages', extendWithQueue(PendingMessageSchema), this.TABLE_CONFIGS.queueTable());
      this.table('user_mfa', extendWithQueue(UserMfaSchema), this.TABLE_CONFIGS.queueTable());
      this.table('user_ekyc', extendWithQueue(UserEkycSchema), this.TABLE_CONFIGS.queueTable());
      this.table('user_did', extendWithQueue(UserDidSchema), this.TABLE_CONFIGS.queueTable());
      this.table('passkey_credentials', extendWithQueue(PasskeyCredentialSchema), this.TABLE_CONFIGS.queueTableWithUniqueIndex('credentialId'));
      this.table('backup_codes', extendWithQueue(BackupCodeSchema), this.TABLE_CONFIGS.queueTableWithUniqueIndex('codeHash'));

      // Initialize states only; do not set alarm here so DO can idle when there is no fetch/WS/queue work
      await this.loadTableStates();
    });
  }

  // ========== GETTERS & DATABASE ==========
  get userId(): string { return this.state.id.toString(); }
  get storage(): DurableObjectStorage { return this.state.storage; }
  
  private table<T extends z.ZodSchema>(name: string, schema: T, options?: TableOptions) {
    return this.database.table(name, schema, options);
  }

  // ========== TABLE STATE MANAGEMENT ==========
  private async loadTableStates(): Promise<void> {
    for (const tableName of this.SYNC_TABLE_NAMES) {
      const storedState = await this.storage.get<TableState>(`table_state_${tableName}`);
      
      if (storedState) {
        this.tableStates.set(tableName, storedState);
      } else {
        const initialState: TableState = {
          tableName,
          lastFlushedId: 0,
          lastProcessedId: 0,
          pendingCount: 0,
          updatedAt: Date.now()
        };
        this.tableStates.set(tableName, initialState);
        await this.saveTableState(tableName);
      }
    }
  }

  private async saveTableState(tableName: string): Promise<void> {
    const state = this.tableStates.get(tableName);
    if (state) {
      state.updatedAt = Date.now();
      await this.storage.put(`table_state_${tableName}`, state);
    }
  }

  private async updateTableState(
    tableName: string, 
    updates: Partial<TableState>
  ): Promise<void> {
    const state = this.tableStates.get(tableName);
    if (!state) return;

    Object.assign(state, updates);
    await this.saveTableState(tableName);
  }


  private async getPendingCount(tableName: string): Promise<number> {
    try {
      const countResult = await this.database.execSelectSQL(
        `SELECT COUNT(*) as count FROM ${tableName} WHERE queueStatus = 'pending'`
      );
      return countResult[0]?.count || 0;
    } catch {
      return 0;
    }
  }

  /** True if any queue table has pending records (in-memory state). Used to decide whether to keep alarm. */
  private hasPendingQueueWork(): boolean {
    for (const state of this.tableStates.values()) {
      console.log(`[UserDO ${this.userId}] hasPendingQueueWork: ${state.tableName} - ${state.pendingCount}`);
      if (state.pendingCount > 0) return true;
    }
    return false;
  }

  /** Đọc cấu hình auth_worker từ KV (override) hoặc env vars. Có hiệu lực ngay khi admin thiết lập. */
  private async getAuthQueueConfig(): Promise<{
    QUEUE_BATCH_SIZE: number;
    QUEUE_FLUSH_THRESHOLD: number;
    QUEUE_FLUSH_INTERVAL: number;
    MAX_SEND_FAILURE_COUNT: number;
    RETRY_ALARM_INTERVAL: number;
  }> {
    const defaults = {
      QUEUE_BATCH_SIZE: parseInt(this.env.QUEUE_BATCH_SIZE || '100', 10),
      QUEUE_FLUSH_THRESHOLD: parseInt(this.env.QUEUE_FLUSH_THRESHOLD || QUEUE_FLUSH_THRESHOLD.toString(), 10),
      QUEUE_FLUSH_INTERVAL: parseInt(this.env.QUEUE_FLUSH_INTERVAL || QUEUE_FLUSH_INTERVAL.toString(), 10),
      MAX_SEND_FAILURE_COUNT: parseInt(this.env.MAX_SEND_FAILURE_COUNT || MAX_SEND_FAILURE_COUNT.toString(), 10),
      RETRY_ALARM_INTERVAL: parseInt(this.env.RETRY_ALARM_INTERVAL || RETRY_ALARM_INTERVAL.toString(), 10),
    };
    const kv = (this.env as any).SYSTEM_CONFIG_KV;
    if (!kv) return defaults;
    try {
      const raw = await kv.get(KV_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      const auth = parsed.auth_worker || {};
      return {
        QUEUE_BATCH_SIZE: auth.QUEUE_BATCH_SIZE ?? defaults.QUEUE_BATCH_SIZE,
        QUEUE_FLUSH_THRESHOLD: auth.QUEUE_FLUSH_THRESHOLD ?? defaults.QUEUE_FLUSH_THRESHOLD,
        QUEUE_FLUSH_INTERVAL: auth.QUEUE_FLUSH_INTERVAL ?? defaults.QUEUE_FLUSH_INTERVAL,
        MAX_SEND_FAILURE_COUNT: auth.MAX_SEND_FAILURE_COUNT ?? defaults.MAX_SEND_FAILURE_COUNT,
        RETRY_ALARM_INTERVAL: auth.RETRY_ALARM_INTERVAL ?? defaults.RETRY_ALARM_INTERVAL,
      };
    } catch {
      return defaults;
    }
  }

  private async shouldFlushTable(tableName: string): Promise<boolean> {
    const state = this.tableStates.get(tableName);
    if (!state) return false;

    const config = await this.getAuthQueueConfig();
    const now = Date.now();
    const lastFlushTime = state.lastFlushTime || 0;

    return state.pendingCount >= config.QUEUE_FLUSH_THRESHOLD || (now - lastFlushTime) > config.QUEUE_FLUSH_INTERVAL;
  }

  // ========== FETCH HANDLER ==========
  async fetch(request: Request): Promise<Response> {
    try {
      if (request.headers.get('Upgrade') === 'websocket') {
        return await this.handleWebSocketUpgrade(request);
      }

      const url = new URL(request.url);
      if (url.hostname === 'user.internal') {
        return await this.handleInternalMessage(request);
      }

      const routeHandlers: Record<string, (req: Request) => Promise<Response>> = {
        '/status': () => this.getWebsocketStatus(),
        '/subscriptions': () => this.getSubscriptionList(),
        '/dynamic/insert': (req) => this.handleDynamicInsert(req),
        '/dynamic/update': (req) => this.handleDynamicUpdate(req),
        '/dynamic/upsert': (req) => this.handleDynamicUpsert(req),
        '/dynamic/delete': (req) => this.handleDynamicDelete(req),
        '/dynamic/select': (req) => this.handleDynamicSelect(req),
        '/dynamic/batch-insert': (req) => this.handleDynamicBatchInsert(req),
        '/dynamic/multi-table': (req) => this.handleDynamicMultiTable(req),
        '/queue/record': (req) => this.handleQueueRecord(req),
        '/queue/flush': (req) => this.handleQueueFlush(req),
        '/queue/stats': () => this.handleQueueStats(),
        '/queue/health': () => this.handleQueueHealth(),
        '/queue/cleanup': (req) => this.handleQueueCleanup(req),
        '/queue/table-state-reset': (req) => this.handleTableStateReset(req),
        '/debug/id-counters': async () => this.handleDebugIdCounters()
      };

      const handler = routeHandlers[url.pathname];
      if (handler) {
        return await handler(request);
      }

      throw new Error(`Unknown path: ${url.pathname}`);
    } catch (error) {
      handleErrorWithoutIp(error, `UserDO ${this.userId} fetch error`);
      return this.jsonResponse({ success: false, error: 'Internal Server Error' }, 500);
    }
  }

  // ========== DYNAMIC OPERATIONS ==========
  private async handleDynamicInsert(request: Request): Promise<Response> {
    const { table, data } = await request.json() as { table: string; data: any };
    
    if (this.isSyncTable(table)) {
      return await this.handleQueueInsert(table, data);
    }
    
    const result = await this.database.dynamicInsert(table, data);
    return this.jsonResponse({ success: true, data: result });
  }

  private async handleQueueInsert(tableName: string, data: any): Promise<Response> {
    const dataWithQueue = this.ensureCatalogQueueStatus(tableName, data);
    const result = await this.database.dynamicInsert(tableName, dataWithQueue);
    
    await this.updateTablePendingCount(tableName);
    
    if (await this.shouldFlushTable(tableName)) {
      this.state.waitUntil(this.flushPendingRecords(tableName));
    }
    await this.scheduleQueueAlarmIfNeeded();

    return this.jsonResponse({ 
      success: true, 
      data: result,
      idInfo: { id: result.id, tableState: this.tableStates.get(tableName) }
    });
  }

  private async handleDynamicUpdate(request: Request): Promise<Response> {
    const { table, id, data } = await request.json() as { table: string; id: number; data: any };
    
    if (this.isSyncTable(table)) {
      const dataWithQueue = this.ensureCatalogQueueStatus(table, data);
      const result = await this.database.dynamicUpdate(table, id, dataWithQueue);
      
      await this.updateTablePendingCount(table);
      
      if (await this.shouldFlushTable(table)) {
        this.state.waitUntil(this.flushPendingRecords(table));
      }
      await this.scheduleQueueAlarmIfNeeded();
      return this.jsonResponse({ 
        success: true, 
        data: result,
        id: id
      });
    }
    
    const result = await this.database.dynamicUpdate(table, id, data);
    return this.jsonResponse({ success: true, data: result });
  }

  private async handleDynamicUpsert(request: Request): Promise<Response> {
    const { table, data, conflictField } = await request.json() as { 
      table: string; 
      data: any; 
      conflictField?: string 
    };
    
    if (this.isSyncTable(table)) {
      const dataWithQueue = this.ensureCatalogQueueStatus(table, data);
      const result = await this.database.dynamicUpsert(table, dataWithQueue, conflictField);
      
      await this.updateTablePendingCount(table);
      
      if (await this.shouldFlushTable(table)) {
        this.state.waitUntil(this.flushPendingRecords(table));
      }
      await this.scheduleQueueAlarmIfNeeded();
      return this.jsonResponse({ 
        success: true, 
        data: result,
        id: result.id
      });
    }
    
    const result = await this.database.dynamicUpsert(table, data, conflictField);
    return this.jsonResponse({ success: true, data: result });
  }

  private async handleDynamicDelete(request: Request): Promise<Response> {
    const { table, id, where } = await request.json() as { 
      table: string; 
      id?: number; 
      where?: { field: string; operator: string; value: any } 
    };
    
    if (id) {
      await this.database.dynamicDelete(table, id);
    } else if (where) {
      const records = await this.database.dynamicSelect(table, where);
      for (const record of records) {
        await this.database.dynamicDelete(table, record.id);
      }
    } else {
      throw new Error('Either id or where condition is required');
    }
    
    if (this.isSyncTable(table)) {
      await this.updateTablePendingCount(table);
    }
    
    return this.jsonResponse({ success: true });
  }

  private async handleDynamicSelect(request: Request): Promise<Response> {
    const { table, where, orderBy, limit, offset } = await request.json() as {
      table: string;
      where?: { field: string; operator: string; value: any } | { field: string; operator: string; value: any }[];
      orderBy?: { field: string; direction: 'ASC' | 'DESC' };
      limit?: number;
      offset?: number;
    };
        
    const result = await this.database.dynamicSelect(table, where, orderBy, limit, offset);
    return this.jsonResponse({ success: true, data: result });
  }

  private async handleDynamicBatchInsert(request: Request): Promise<Response> {
    const { table, data } = await request.json() as { table: string; data: any[] };
    
    if (this.isSyncTable(table)) {
      const results = await Promise.all(
        data.map(record => 
          this.database.dynamicInsert(table, this.ensureCatalogQueueStatus(table, record))
        )
      );
      
      await this.updateTablePendingCount(table);
      
      if (await this.shouldFlushTable(table)) {
        this.state.waitUntil(this.flushPendingRecords(table));
      }
      await this.scheduleQueueAlarmIfNeeded();
      return this.jsonResponse({ 
        success: true, 
        data: results,
        batchInfo: { recordCount: data.length, tableState: this.tableStates.get(table) }
      });
    }
    
    const result = await this.database.dynamicBatchInsert(table, data);
    return this.jsonResponse({ success: true, data: result });
  }

  private async handleDynamicMultiTable(request: Request): Promise<Response> {
    const { operations } = await request.json() as {
      operations: Array<{
        table: string;
        operation: 'insert' | 'update' | 'upsert' | 'delete';
        data?: any;
        id?: number;
        conflictField?: string;
        where?: { field: string; operator: string; value: any };
      }>;
    };
    
    const processedOps = operations.map(op => {
      if (op.data && (op.operation === 'insert' || op.operation === 'update' || op.operation === 'upsert')) {
        return { ...op, data: this.ensureCatalogQueueStatus(op.table, op.data) };
      }
      return op;
    });
    const result = await this.database.dynamicMultiTableTransaction(processedOps);
    
    const updatedTables = new Set(
      operations
        .filter(op => this.isSyncTable(op.table))
        .map(op => op.table)
    );
    
    for (const tableName of updatedTables) {
      await this.updateTablePendingCount(tableName);
      if (await this.shouldFlushTable(tableName)) {
        this.state.waitUntil(this.flushPendingRecords(tableName));
      }
    }
    await this.scheduleQueueAlarmIfNeeded();
    return this.jsonResponse({ success: true, data: result });
  }

  // ========== QUEUE MANAGEMENT ==========
  private async handleQueueRecord(request: Request): Promise<Response> {
    const { table, data, operation = "insert" } = await request.json() as {
      table: string;
      data: any;
      operation?: "insert" | "update" | "upsert" | "delete";
    };
    
    if (!this.isSyncTable(table)) {
      return this.jsonResponse({ error: `Table ${table} not found` }, 400);
    }

    let result: any;
    
    const dataWithQueue = this.ensureCatalogQueueStatus(table, data);
    switch (operation) {
      case "insert":
        result = await this.database.dynamicInsert(table, dataWithQueue);
        break;
      case "update":
        result = await this.database.dynamicUpdate(table, data.id, dataWithQueue);
        break;
      case "upsert":
        result = await this.database.dynamicUpsert(table, dataWithQueue);
        break;
      case "delete":
        await this.database.dynamicDelete(table, data.id);
        result = { deleted: true };
        break;
    }

    await this.updateTablePendingCount(table);

    if (await this.shouldFlushTable(table)) {
      this.state.waitUntil(this.flushPendingRecords(table));
    }
    await this.scheduleQueueAlarmIfNeeded();
    return this.jsonResponse({ 
      success: true, 
      data: result,
      idInfo: { id: result?.id, tableState: this.tableStates.get(table) }
    });
  }

  private async handleQueueFlush(request: Request): Promise<Response> {
    const { table, force = false } = await request.json() as {
      table?: string;
      force?: boolean;
    };
    
    if (table) {
      if (!this.isSyncTable(table)) {
        return this.jsonResponse({ error: `Table ${table} is not a sync table` }, 400);
      }
      
      await this.flushPendingRecords(table, force);
      return this.jsonResponse({ 
        success: true,
        table,
        message: `Flushed pending records for ${table}`,
        tableState: this.tableStates.get(table)
      });
    }
    
    const results = [];
    for (const tableName of this.SYNC_TABLE_NAMES) {
      if (force || (await this.shouldFlushTable(tableName))) {
        await this.flushPendingRecords(tableName, force);
        results.push({
          table: tableName,
          flushed: true,
          tableState: this.tableStates.get(tableName)
        });
      }
    }
    
    return this.jsonResponse({ 
      success: true,
      results,
      message: `Flushed ${results.length} tables`
    });
  }

  private async handleQueueCleanup(request: Request): Promise<Response> {
    try {
      const { table, cleanupMethod = 'delete', upToId } = await request.json() as {
        table: string;
        cleanupMethod: 'delete' | 'mark';
        upToId: number;
      };
      
      if (!this.isSyncTable(table)) {
        return this.jsonResponse({ 
          success: false, 
          error: `Table ${table} is not a sync table` 
        }, 400);
      }
      
      const result = await this.cleanupProcessedRecords(table, cleanupMethod, upToId);
      
      return this.jsonResponse({
        success: true,
        data: result,
        message: `Cleaned up processed records for table ${table} using method: ${cleanupMethod}`
      });
    } catch (error) {
      handleErrorWithoutIp(error, `Queue cleanup error for UserDO ${this.userId}`);
      return this.jsonResponse({ 
        success: false, 
        error: 'Cleanup failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, 500);
    }
  }

  /** Xoá table_state_${tableName} khỏi storage và reset in-memory state */
  private async handleTableStateReset(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const tableName = url.searchParams.get('tableName');
      
      if (!tableName || typeof tableName !== 'string') {
        return this.jsonResponse({ 
          success: false, 
          error: 'tableName is required' 
        }, 400);
      }
      
      if (!this.isSyncTable(tableName)) {
        return this.jsonResponse({ 
          success: false, 
          error: `Table ${tableName} is not a sync table` 
        }, 400);
      }
      
      const storageKey = `table_state_${tableName}`;
      await this.storage.delete(storageKey);
      
      const initialState: TableState = {
        tableName,
        lastFlushedId: 0,
        lastProcessedId: 0,
        pendingCount: 0,
        updatedAt: Date.now()
      };
      console.log(`[UserDO ${this.userId}] Reset table state for ${tableName} to ${JSON.stringify(initialState)}`);
      this.tableStates.set(tableName, initialState);
      
      return this.jsonResponse({
        success: true,
        message: `Reset table state for ${tableName}`,
        tableName,
        userId: this.userId
      });
    } catch (error) {
      handleErrorWithoutIp(error, `Table state reset error for UserDO ${this.userId}`);
      return this.jsonResponse({ 
        success: false, 
        error: 'Table state reset failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, 500);
    }
  }

  // ========== QUEUE FLUSH LOGIC ==========
  private async flushPendingRecords(tableName: string, force: boolean = false): Promise<void> {
    const state = this.tableStates.get(tableName);
    if (!state) return;

    const config = await this.getAuthQueueConfig();
    const batchSize = config.QUEUE_BATCH_SIZE;

    try {
      const pendingRecords = await this.database.execSelectSQL(
        `SELECT * FROM ${tableName} 
         WHERE queueStatus = 'pending' 
         ORDER BY queueId ASC
         LIMIT ${batchSize}`
      );

      if (pendingRecords.length === 0) {
        await this.updateTableState(tableName, {
          pendingCount: 0
        });
        return;
      }

      const minId = pendingRecords[0].queueId;
      const maxId = Math.max(...pendingRecords.map(r => r.queueId));

      await this.env.INPUT_QUEUE.send(
        pendingRecords.map(record => ({
          body: JSON.stringify({
            table: tableName,
            schema: this.database.getTableConfig(tableName)?.schema,
            data: record,
            id: record.queueId,
            batchInfo: {
              userId: this.userId,
              table: tableName,
              batchSize: pendingRecords.length,
              minId,
              maxId,
              previousFlushedId: state.lastFlushedId,
              timestamp: Date.now()
            }
          })
        }))
      );

      await this.markRecordsAsFlushed(tableName, minId, maxId);
      await this.updateTableState(tableName, { 
        lastFlushedId: maxId, 
        lastFlushTime: Date.now(),
        pendingCount: await this.getPendingCount(tableName)
      });

      console.log(`[UserDO ${this.userId}] Flushed ${pendingRecords.length} records from ${tableName}, up to id ${maxId}`);

    } catch (error) {
      console.error(`[UserDO ${this.userId}] Failed to flush records from ${tableName}:`, error);
      const errMsg = error instanceof Error ? error.message : String(error);
      if (!errMsg.includes('no such column') && !errMsg.includes('SQLITE_ERROR')) {
        this.state.waitUntil(
          (async () => {
            await new Promise(resolve => setTimeout(resolve, 1000));
            await this.flushPendingRecords(tableName, force);
          })()
        );
      }
    }
  }

  private async markRecordsAsFlushed(tableName: string, minId: number, maxId: number): Promise<number> {
    await this.database.execTransaction([{
      sql: `UPDATE ${tableName} 
            SET queueStatus = 'flushed', flushedAt = ? 
            WHERE queueStatus = 'pending' 
            AND queueId >= ? 
            AND queueId <= ?`,
      params: [Date.now(), minId, maxId]
    }]);
    
    const countResult = await this.database.execSelectSQL(
      `SELECT COUNT(*) as count FROM ${tableName} 
       WHERE queueStatus = 'flushed' 
       AND queueId >= ? 
       AND queueId <= ?`,
      [minId, maxId]
    );
    
    return countResult[0]?.count || 0;
  }

  private async cleanupProcessedRecords(tableName: string, method: 'delete' | 'mark' = 'delete', upToId: number): Promise<{
    deletedCount: number;
    markedCount: number;
    table: string;
    timestamp: number;
    processedUpTo: number;
  }> {
    const state = this.tableStates.get(tableName);
    if (!state) {
      throw new Error(`Table state not found for ${tableName}`);
    }

    // Bảng danh mục: KHÔNG xoá record khi cleanup (giữ lại để tiết kiệm tra cứu)
    const shouldDelete = this.shouldDeleteOnCleanup(tableName) && method === 'delete' && state.lastProcessedId < upToId;
    if (shouldDelete) {
      const deletedCount = await this.deleteProcessedRecords(tableName, upToId);
      return { deletedCount, markedCount: 0, table: tableName, timestamp: Date.now(), processedUpTo: upToId };
    } else {
      const markedCount = await this.markRecordsAsProcessed(tableName, upToId);
      await this.updateTableState(tableName, { lastProcessedId: upToId });
      return { deletedCount: 0, markedCount, table: tableName, timestamp: Date.now(), processedUpTo: upToId };
    }
  }

  private async deleteProcessedRecords(tableName: string, upToId: number): Promise<number> {
    const countResult = await this.database.execSelectSQL(
      `SELECT COUNT(*) as count FROM ${tableName} 
       WHERE queueStatus = 'processed' 
       AND queueId <= ?`,
      [upToId]
    );
    
    const countToDelete = countResult[0]?.count || 0;
    
    if (countToDelete > 0) {
      await this.database.execTransaction([{
        sql: `DELETE FROM ${tableName} 
              WHERE queueStatus = 'processed' 
              AND queueId <= ?`,
        params: [upToId]
      }]);
      
      console.log(`[UserDO ${this.userId}] Deleted ${countToDelete} processed records from ${tableName}, up to id ${upToId}`);
    }
    
    return countToDelete;
  }

  private async markRecordsAsProcessed(tableName: string, upToId: number): Promise<number> {
    const countResult = await this.database.execSelectSQL(
      `SELECT COUNT(*) as count FROM ${tableName} 
       WHERE queueStatus = 'flushed' 
       AND queueId <= ?`,
      [upToId]
    );
    
    const countToMark = countResult[0]?.count || 0;
    if (countToMark > 0) {
      await this.database.execTransaction([{
        sql: `UPDATE ${tableName} SET queueStatus = 'processed', processedAt = ?
              WHERE queueStatus = 'flushed' 
              AND queueId <= ?`,
        params: [Date.now(), upToId]
      }]);
      
      console.log(`[UserDO ${this.userId}] Marked ${countToMark} flushed records to processed in ${tableName}, up to id ${upToId}`);
    }
    
    return countToMark;
  }

  // ========== QUEUE STATS & HEALTH ==========
  private async handleQueueStats(): Promise<Response> {
    const now = Date.now();
    const stats: Record<string, any> = {};
    
    for (const tableName of this.SYNC_TABLE_NAMES) {
      const state = this.tableStates.get(tableName);
      const statusStats = await this.getQueueStatusStats(tableName);
      
      stats[tableName] = {
        tableState: state,
        ...this.calculateTableMetrics(statusStats, now, state),
        shouldFlush: await this.shouldFlushTable(tableName)
      };
    }

    return this.jsonResponse({
      success: true,
      data: stats,
      userId: this.userId,
      timestamp: now
    });
  }

  /** Debug: xem giá trị tất cả ID counters (tableName và tableName_queue) */
  private async handleDebugIdCounters(): Promise<Response> {
    const counters = this.database.getIdCounters();
    return this.jsonResponse({
      success: true,
      data: counters,
      userId: this.userId,
      description: 'Số tiếp theo sẽ là: value + 1. Key [table]_queue = counter cho queueId'
    });
  }

  private async getQueueStatusStats(tableName: string): Promise<any[]> {
    try {
      return await this.database.execSelectSQL(`
        SELECT 
          queueStatus,
          COUNT(*) as count,
          MIN(queueId) as minId,
          MAX(queueId) as maxId
        FROM ${tableName}
        GROUP BY queueStatus
      `);
    } catch {
      return [];
    }
  }

  private calculateTableMetrics(statusStats: any[], now: number, state?: TableState) {
    const getStats = (status: string) => 
      statusStats.find(s => s.queueStatus === status) || { count: 0, minId: 0, maxId: 0 };
    
    const pending = getStats('pending');
    const flushed = getStats('flushed');
    const processed = getStats('processed');
    
    return {
      pending: {
        count: pending.count,
        minId: pending.minId,
        maxId: pending.maxId,
        ageSeconds: pending.maxId > 0 ? 
          Math.floor((now - (state?.lastFlushTime || now)) / 1000) : 0
      },
      flushed: { count: flushed.count, minId: flushed.minId, maxId: flushed.maxId },
      processed: { count: processed.count, minId: processed.minId, maxId: processed.maxId },
      totalRecords: statusStats.reduce((sum, s) => sum + s.count, 0),
      lastUpdated: now
    };
  }

  private async handleQueueHealth(): Promise<Response> {
    let totalPending = 0;
    let totalProcessed = 0;
    let unhealthyTables = 0;
    
    for (const tableName of this.SYNC_TABLE_NAMES) {
      const state = this.tableStates.get(tableName);
      if (!state) continue;
      
      const [pendingResult, processedResult] = await Promise.all([
        this.database.execSelectSQL(
          `SELECT COUNT(*) as count FROM ${tableName} WHERE queueStatus = 'pending'`,
          []
        ),
        this.database.execSelectSQL(
          `SELECT COUNT(*) as count FROM ${tableName} WHERE queueStatus = 'processed'`,
          []
        )
      ]);
      
      totalPending += pendingResult[0]?.count || 0;
      totalProcessed += processedResult[0]?.count || 0;
      
      const oldPendingResult = await this.database.execSelectSQL(
        `SELECT COUNT(*) as count FROM ${tableName} 
         WHERE queueStatus = 'pending' 
         AND queueId <= ?`,
        [state.lastFlushedId]
      );
      
      if ((oldPendingResult[0]?.count || 0) > 0) {
        unhealthyTables++;
      }
    }
    
    const healthStatus = unhealthyTables > 0 ? 'warning' : 
                       totalPending > 1000 ? 'degraded' : 'healthy';
    
    return this.jsonResponse({
      success: true,
      status: healthStatus,
      queueEnabled: true,
      tablesCount: this.SYNC_TABLE_NAMES.length,
      pendingTotal: totalPending,
      processedTotal: totalProcessed,
      unhealthyTables,
      userId: this.userId,
      timestamp: Date.now()
    });
  }

  // ========== ALARM HANDLER ==========
  async alarm() {
    try {
      await Promise.all([
        this.sendHeartbeat(),
        this.flushAllPendingRecords(),
        this.cleanupOldProcessedRecords()
      ]);

      // Re-schedule alarm only when there is a reason to wake again (WS or pending queue). Otherwise DO goes idle.
      const hasWebSockets = this.state.getWebSockets().length > 0;
      console.log(`[UserDO ${this.userId}] hasWebSockets: ${hasWebSockets}`);
      const hasPending = this.hasPendingQueueWork();
      console.log(`[UserDO ${this.userId}] hasPending: ${hasPending}`);
      if (hasWebSockets || hasPending) {
        const config = await this.getAuthQueueConfig();
        await this.storage.setAlarm(Date.now() + config.RETRY_ALARM_INTERVAL);
      }
    } catch (error) {
      handleErrorWithoutIp(error, "Alarm execution error");
    }
  }

  private async flushAllPendingRecords(): Promise<void> {
    const tablesToFlush: string[] = [];
    for (const tableName of this.SYNC_TABLE_NAMES) {
      if (await this.shouldFlushTable(tableName)) tablesToFlush.push(tableName);
    }
    const promises = tablesToFlush.map(tableName => {
        console.log(`[UserDO ${this.userId}] Auto-flushing ${tableName}`);
        return this.flushPendingRecords(tableName);
      });
    
    await Promise.all(promises);
  }

  private async cleanupOldProcessedRecords(): Promise<void> {
    
    for (const tableName of this.QUEUE_TABLE_NAMES) {
      try {
        // Get the id of the last processed record
        const cutoffResult = await this.database.execSelectSQL(
          `SELECT MAX(queueId) as maxId FROM ${tableName} 
           WHERE queueStatus = 'processed'`);
        
        const cutoffId = cutoffResult[0]?.maxId || 0;
        
        if (cutoffId > 0) {
          const deleteResult = await this.database.execSelectSQL(
            `SELECT COUNT(*) as count FROM ${tableName} 
             WHERE queueStatus = 'processed' 
             AND queueId <= ?`,
            [cutoffId]
          );
          
          const countToDelete = deleteResult[0]?.count || 0;
          
          if (countToDelete > 0) {
            await this.database.execTransaction([{
              sql: `DELETE FROM ${tableName} 
                    WHERE queueStatus = 'processed' 
                    AND queueId <= ?`,
              params: [cutoffId]
            }]);
            
            console.log(`[UserDO ${this.userId}] Cleaned up ${countToDelete} old processed records from ${tableName}`);
            
            const state = this.tableStates.get(tableName);
            if (state && state.lastProcessedId <= cutoffId) {
              await this.updateTableState(tableName, { lastProcessedId: cutoffId });
            }
          }
        }
      } catch (error) {
        console.error(`[UserDO ${this.userId}] Error cleaning up old records from ${tableName}:`, error);
      }
    }
  }

  // ========== HELPER METHODS ==========
  private isSyncTable(tableName: string): boolean {
    return this.SYNC_TABLE_NAMES.includes(tableName);
  }

  /** Chỉ bảng QUEUE_TABLE_NAMES mới xoá record khi cleanup (tiết kiệm storage). Bảng danh mục giữ lại. */
  private shouldDeleteOnCleanup(tableName: string): boolean {
    return this.QUEUE_TABLE_NAMES.includes(tableName);
  }

  /** Chỉ bảng danh mục (không thuộc QUEUE_TABLE_NAMES): mặc định queueStatus = 'pending' khi insert nếu chưa có. */
  private ensureCatalogQueueStatus(tableName: string, data: any): any {
    if (this.isSyncTable(tableName) && !this.shouldDeleteOnCleanup(tableName)) {
      if (data.queueStatus === undefined || data.queueStatus === null) {
        return { ...data, queueStatus: 'pending' as const };
      }
    }
    return data;
  }

  private async updateTablePendingCount(tableName: string): Promise<void> {
    const pendingCount = await this.getPendingCount(tableName);
    await this.updateTableState(tableName, { pendingCount });
  }

  /** Set alarm only when DO has active reason to wake: WebSocket(s) or pending queue work. Otherwise DO stays idle. */
  private async scheduleQueueAlarmIfNeeded(): Promise<void> {
    const hasWebSockets = this.state.getWebSockets().length > 0;
    const hasPending = this.hasPendingQueueWork();
    if (!hasWebSockets && !hasPending) return;

    const currentAlarm = await this.storage.getAlarm();
    if (currentAlarm === null) {
      const config = await this.getAuthQueueConfig();
      await this.storage.setAlarm(Date.now() + config.RETRY_ALARM_INTERVAL);
    }
  }

  private jsonResponse(data: any, status: number = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // ========== WEBSOCKET HANDLERS (giữ nguyên, nhưng đơn giản hóa) ==========
  private async handleWebSocketUpgrade(request: Request): Promise<Response> {
    try {
      const { ipAddress, userAgent } = getIPAndUserAgent(request);
      if (!ipAddress || !userAgent) throw new Error('Missing IP or user agent');
      
      const webSocketPair = new WebSocketPair();
      const [client, server] = Object.values(webSocketPair);
      
      this.state.acceptWebSocket(server);
      const encryptSecret= await this.env.ENCRYPTION_SECRET.get();
      if (!encryptSecret) {
        throw new Error("ENCRYPTION_SECRET is not defined in environment variables");
      }

      const sessionId = getSessionIdHash(ipAddress, userAgent, encryptSecret);
      await this.database.dynamicUpsert("connections", {
        connected: true, 
        lastConnected: Date.now(), 
        sessionId,
        queueStatus: 'pending' as const
      });      
      
      this.sessions.set(server, sessionId);
      // Persist sessionId với WebSocket để survive hibernation (khi DO hibernate, in-memory state bị mất)
      server.serializeAttachment({ sessionId });
      this.state.waitUntil(Promise.all([
        this.registerUser(), 
        this.sendPendingMessages(server),
        this.sendPendingFirstLoginNotificationIfAny()
      ]));

      await this.scheduleQueueAlarmIfNeeded();

      return new Response(null, {
        status: 101,
        webSocket: client,
        headers: new Headers({
          'X-WebSocket-Status': 'connected',
          'X-User-ID': this.userId,
          'X-Session-ID': sessionId
        })
      });      
    } catch (error) {
      const { errorResponse } = await handleErrorWithoutIp(error, 'WebSocket upgrade error');  
      return this.jsonResponse({
        success: false,
        error: "WebSocket connection failed",
        code: "WEBSOCKET_UPGRADE_FAILED",
        details: errorResponse,
        timestamp: Date.now()
      }, 500);      
    }
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    try {
      const data = typeof message === 'string' ? message : new TextDecoder().decode(message);
      const parsed = WebSocketMessageSchema.parse(JSON.parse(data));
      await this.handleMessage(ws, parsed);
    } catch (e) {
      handleErrorWithoutIp(e, `Processing message error: ${message}`);
      await this.sendMessage(ws, { type: 'error', message: 'Invalid message format' });
    }
  }

  private async handleMessage(ws: WebSocket, message: z.infer<typeof WebSocketMessageSchema>) {
    const handlers: Record<string, () => Promise<void>> = {
      ping: async () => { await this.sendMessage(ws, { type: 'pong', timestamp: Date.now() }) },
      subscribe: async () => {
        if (message.channel) {
          await this.handleSubscribe(message.channel);
          await this.sendMessage(ws, { type: 'subscribed', channel: message.channel });
        }
      },
      unsubscribe: async () => {
        if (message.channel) {
          await this.handleUnsubscribe(message.channel);
          await this.sendMessage(ws, { type: 'unsubscribed', channel: message.channel });
        }
      }
    };

    const handler = handlers[message.type];
    if (handler) await handler();
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    try {
      console.log(`[UserDO ${this.userId}] webSocketClose: code=${code}, reason=${reason}, wasClean=${wasClean}`);
      this.sendFailureCount.delete(ws);
      // Lấy sessionId từ attachment (survive hibernation) hoặc từ memory (khi DO chưa hibernate)
      const sessionId = (ws.deserializeAttachment() as { sessionId?: string } | null)?.sessionId ?? this.sessions.get(ws);
      if (sessionId) {
        const connections = await this.database.dynamicSelect('connections', { field: 'sessionId', operator: '=', value: sessionId });
        if (connections.length > 0) {
          await this.database.dynamicUpdate('connections', connections[0].id, { connected: 0, queueStatus: 'pending' as const });
        }
      }
      this.sessions.delete(ws);
      await this.unregisterUser();
      await this.storage.deleteAlarm();
      await this.scheduleQueueAlarmIfNeeded();
    } catch (e) {
      handleErrorWithoutIp(e, "UserDO WebSocket closed error");
    }
  }

  async webSocketError(ws: WebSocket, error: unknown) {
    handleErrorWithoutIp(error, `UserDO ${this.userId} WebSocket error`);
    try { ws.close(1011, 'Internal server error'); } 
    catch (closeError) { handleErrorWithoutIp(closeError, "Close webSocket error"); }
  }

  // ========== MESSAGE & BROADCAST MANAGEMENT ==========
  private async sendMessage(ws: WebSocket, message: any): Promise<boolean> {
    console.log(`[UserDO] sendMessage: sending to ws=${ws} message=${JSON.stringify(message)}`);
    try {
      if (ws.readyState !== WebSocket.OPEN) {
        return false;
      }
      
      const messageStr = JSON.stringify(message);
      if (messageStr.length > 1024 * 1024) return false;

      ws.send(messageStr);
      this.sendFailureCount.set(ws, 0);
      return true;
    } catch (error) {
      await this.handleSendError(ws, error, message);
      return false;
    }    
  }

  private async handleSendError(ws: WebSocket, error: any, message: any): Promise<void> {
    const currentFailures = this.sendFailureCount.get(ws) || 0;
    const newFailures = currentFailures + 1;
    this.sendFailureCount.set(ws, newFailures);
        
    if (!error.message?.includes("Invalid") && !error.message?.includes("too large")) {
      try { 
        const sessionId = (ws.deserializeAttachment() as { sessionId?: string } | null)?.sessionId ?? this.sessions.get(ws);
        if (sessionId) {
          await this.storePendingMessage(sessionId, message); 
        }
      } catch (e) { 
        handleErrorWithoutIp(e, `Store pending message error: ${message}`); 
      }
    }

    const config = await this.getAuthQueueConfig();
    if (newFailures >= config.MAX_SEND_FAILURE_COUNT) {
      try { ws.close(1011, 'Send failure'); } 
      catch (closeError) { handleErrorWithoutIp(closeError, "Close webSocket error"); }
    }
  }

  private async storePendingMessage(sessionId: string, message: any) {
    await this.database.dynamicInsert('pending_messages', {
      message: BroadcastValidator.sanitizeBroadcastMessage(message),
      type: message.type || 'unknown',
      priority: 'medium',
      attempts: 0,
      maxAttempts: 3,
      scheduledFor: Date.now(),
      sessionId,
      queueStatus: 'pending' as const
    });
  }

  private async sendPendingMessages(ws: WebSocket) {
    if (ws.readyState !== WebSocket.OPEN) return;
    const sessionId = (ws.deserializeAttachment() as { sessionId?: string } | null)?.sessionId ?? this.sessions.get(ws);
    if (!sessionId) return;

    const pendingMessages = await this.database.execSelectSQL(
      'SELECT * FROM pending_messages WHERE sessionId = ? AND attempts < maxAttempts ORDER BY priority DESC, scheduledFor ASC',
      [sessionId]
    );
    
    for (const pendingMessage of pendingMessages) {
      if (await this.sendMessage(ws, pendingMessage.message)) {
        await this.database.dynamicDelete('pending_messages', pendingMessage.id);
      } else {
        break;
      }
    }
  }

  protected broadcast(event: string, data: any): void {
    const message = { event, data, timestamp: Date.now() };
    console.log(`[UserDO] broadcast: sending to ${this.state.getWebSockets().length} websockets message=${JSON.stringify(message)}`);
    this.state.getWebSockets().forEach(ws => this.sendMessage(ws, message));
  }

  /** Gửi notification 2FA khi user connect WS lần đầu (đúng flow: login → token → WS connect → notification) */
  private async sendPendingFirstLoginNotificationIfAny(): Promise<void> {
    try {
      const stored = await this.storage.get<string>('pending_first_login_notification');
      if (!stored) return;
      const payload = JSON.parse(stored) as { title: string; body?: string; data?: Record<string, unknown> };
      await this.storage.delete('pending_first_login_notification');
      this.broadcast('broadcast', payload);
      console.log(`[UserDO] sent pending_first_login_notification to userId=${this.userId}`);
    } catch (e) {
      handleErrorWithoutIp(e, 'sendPendingFirstLoginNotificationIfAny error');
    }
  }

  private async sendHeartbeat(): Promise<void> {
    const webSockets = this.state.getWebSockets();
    this.broadcast('heartbeat', { 
      type: 'periodic', 
      activeConnections: webSockets.length, 
      timestamp: Date.now()
    });
  }

  // ========== SUBSCRIPTION MANAGEMENT ==========
  private async handleSubscribe(channel: string) {
    await this.database.dynamicUpsert('subscriptions', {
      channel,
      subscribedAt: Date.now(),
      isActive: true,
      queueStatus: 'pending' as const
    });
  }

  private async handleUnsubscribe(channel: string) {
    const subscriptions = await this.database.dynamicSelect('subscriptions', { field: 'channel', operator: '=', value: channel });
    if (subscriptions.length > 0) {
      await this.database.dynamicUpdate('subscriptions', subscriptions[0].id, { isActive: false, queueStatus: 'pending' as const });
    }
  }

  private async getSubscriptions(): Promise<Subscription[]> {
    return await this.database.dynamicSelect('subscriptions', { 
      field: 'isActive', 
      operator: '=', 
      value: true 
    });    
  }

  // ========== INTERNAL MESSAGE HANDLER ==========
  private async handleInternalMessage(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname.startsWith('/repository/')) {
      return await this.handleRepositoryOperations(request, url.pathname);
    }

    const message = await request.json() as { type: string; [key: string]: any };
    if (message.type === 'broadcast') {
      console.log(`[UserDO] internal message: broadcast received userId=${this.userId} broadcastId=${message.broadcastId}`);
      await this.handleDirectBroadcast(message);
    } else if (message.type === 'storePendingFirstLoginNotification') {
      const payload = message.message as { title: string; body?: string; data?: Record<string, unknown> };
      await this.storage.put('pending_first_login_notification', JSON.stringify(payload));
      console.log(`[UserDO] stored pending_first_login_notification for userId=${this.userId}`);
    }

    return this.jsonResponse({ success: true, status: 'processed' });
  }

  private async handleRepositoryOperations(request: Request, path: string): Promise<Response> {
    const data = await request.json() as any;
    
    switch (path) {
      case '/repository/transaction':
        await this.database.execTransaction(data.operations);
        return this.jsonResponse({ success: true });
        
      case '/repository/select':
        const result = await this.database.execSelectSQL(data.sql, data.params || [], data.table);
        return this.jsonResponse({ success: true, data: result });
                
      default:
        return this.jsonResponse({ success: false, error: 'Not found' }, 404);
    }
  }

  private async handleDirectBroadcast(message: any) {    
    console.log(`[UserDO] handleDirectBroadcast: delivering userId=${this.userId} broadcastId=${message.broadcastId} message=${message.message}`);
    await this.broadcast("broadcast", message.message);
    this.state.waitUntil(this.recordLocalDelivery(message.broadcastId));
  }

  private async recordLocalDelivery(broadcastId: string) {
    const current = await this.storage.get<number>(`user_delivery_${broadcastId}`) || 0;
    const newCount = current + 1;
    await this.storage.put(`user_delivery_${broadcastId}`, newCount);

    if (newCount % 10 === 0) {
      this.state.waitUntil(this.reportDeliveryToShard(broadcastId, newCount));
    }
  }

  private async reportDeliveryToShard(broadcastId: string, deliveredCount: number) {
    const shardName = this.getShardForUser(this.userId);
    console.log(`[UserDO] reportDeliveryToShard: reporting userId=${this.userId} broadcastId=${broadcastId} deliveredCount=${deliveredCount} shardName=${shardName}`);
    const shardDO = this.env.USER_SHARD_DO.get(this.env.USER_SHARD_DO.idFromName(shardName));

    await shardDO.fetch('https://shard.internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'user_delivery_report',
        broadcastId,
        deliveredCount,
        userId: this.userId,
        timestamp: Date.now()
      })
    });
    
    await this.storage.delete(`user_delivery_${broadcastId}`);    
  }

  private getShardForUser(userId: string): string {
    const hash = this.consistentHash(userId, this.scaleConfig.SHARD_COUNT);
    return `shard-${hash}`;
  }

  private consistentHash(str: string, buckets: number): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash) % buckets;
  }

  // ========== USER REGISTRATION ==========
  private async registerUser() {
    const broadcastDO = this.env.BROADCAST_SERVICE_DO.get(
      this.env.BROADCAST_SERVICE_DO.idFromName("global")
    );

    const response = await broadcastDO.fetch('https://broadcast.internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'registerUser', userId: this.userId })
    });
    
    if (!response.ok) throw new Error(`Failed to register user: ${response.statusText}`);
  }

  private async unregisterUser() {
    const broadcastDO = this.env.BROADCAST_SERVICE_DO.get(
      this.env.BROADCAST_SERVICE_DO.idFromName("global")
    );

    const response = await broadcastDO.fetch('https://broadcast.internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unregisterUser', userId: this.userId })
    });
    
    if (!response.ok) throw new Error(`Failed to unregister user: ${response.statusText}`);
  }

  async getWebsocketStatus() {
    const [pendingMessages, subscriptions, webSockets] = await Promise.all([
      this.database.dynamicSelect('pending_messages'),
      this.getSubscriptions(),
      this.state.getWebSockets()
    ]);

    const status = {
      userId: this.userId, 
      pendingMessages: pendingMessages.length,
      subscribedChannels: subscriptions.map(sub => sub.channel),
      activeConnections: webSockets.length,
      timestamp: Date.now()
    };

    return this.jsonResponse({ success: true, data: status });  
  }

  async getSubscriptionList(): Promise<Response> {
    const subscriptions = await this.getSubscriptions();
    return this.jsonResponse({ success: true, data: { subscriptions } });
  }
}