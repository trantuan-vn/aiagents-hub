import { DurableObject } from 'cloudflare:workers';
import { z } from 'zod';
import { UserDODatabase, TableOptions } from '../../../shared/database/index.js';
import { 
  ShardConfig, ShardConfigName, ShardInfo, UserRegistration, UserBatch, 
  ShardPerformance, CleanupOperation, ShardConfigResponse, UserCountResponse,
  DEFAULT_SHARD_CONFIGS, ShardValidator, UserRegistrationSchema,
  CleanupOperationSchema, ShardPerformanceSchema, ShardConfigSchema
} from '../domain';
import { handleErrorWithoutIp } from '../../../shared/utils';

export class UserShardDO extends DurableObject {

  protected state: DurableObjectState;
  protected storage: DurableObjectStorage;
  protected env: Env;
  protected database: UserDODatabase;

  private shardConfig: ShardConfig = DEFAULT_SHARD_CONFIGS['1M+'];
  private shardConfigName: ShardConfigName = '1M+';
  /** Đảm bảo bảng được tạo xong trước khi xử lý request (constructor không await được async). */
  private initializationPromise: Promise<void> | null = null;
  private shardName = '';

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.state = state;
    this.storage = state.storage;
    this.env = env;
    this.database = new UserDODatabase(this.storage, this.userId);
  }

  private getInitializationPromise(): Promise<void> {
    if (!this.initializationPromise) {
      this.initializationPromise = this.initializeTables();
    }
    return this.initializationPromise;
  }

  private async initializeTables(): Promise<void> {
    await this.state.blockConcurrencyWhile(async () => {
      // Phase 1: tạo hết các bảng trước (ensureTableExists sync)
      this.table('user_registrations', UserRegistrationSchema, {
        autoFields: { id: true, timestamps: true, user: true },
      });
      this.table('cleanup_operations', CleanupOperationSchema, {
        autoFields: { id: true, timestamps: true, user: true },
      });
      this.table('shard_performances', ShardPerformanceSchema, {
        autoFields: { id: true, timestamps: true, user: true },
        conflictField: 'shardName',
      });
      this.table('shard_configs', ShardConfigSchema, {
        autoFields: { id: true, timestamps: true, user: true },
      });
    });
    // Phase 2: bảng đã có sẵn, mới seed/load config
    await this.initialize();
  }

  // =============================================
  // GETTERS & INITIALIZATION
  // =============================================
  get userId(): string { return this.state.id.toString(); }
  /** Shard name from DO id (from idFromName). Fallback to id string so it is never undefined for DB. */
  
  async initShard(name: string) {
    this.shardName = name;
  }

  table<T extends z.ZodSchema>(name: string, schema: T, options?: TableOptions) {
    return this.database.table(name, schema, options);
  }

  private async initialize() {
    const existingConfig = await this.database.dynamicSelect('shard_configs', { field: 'key', operator: '=', value: 'scaleConfigName' });
    if (existingConfig.length === 0) {
      await Promise.all([
        this.database.dynamicInsert('shard_configs', { key: 'scaleConfigName', ...DEFAULT_SHARD_CONFIGS['1M+'] }),
        this.database.dynamicInsert('shard_performances', this.getInitialPerformanceMetricsForInsert()),
      ]);
    }
    this.shardConfig = existingConfig.length > 0
      ? {
          BATCH_SIZE: existingConfig[0].BATCH_SIZE,
          PARALLEL_BATCHES: existingConfig[0].PARALLEL_BATCHES,
          DELAY_BETWEEN_BATCHES: existingConfig[0].DELAY_BETWEEN_BATCHES,
          STAGGER_WINDOW: existingConfig[0].STAGGER_WINDOW,
        }
      : DEFAULT_SHARD_CONFIGS['1M+'];
  }

  // =============================================
  // REQUEST HANDLER
  // =============================================
  async fetch(request: Request): Promise<Response> {
    await this.getInitializationPromise();
    try {
      const url = new URL(request.url);
      if (url.hostname === 'shard.internal') return await this.handleInternalMessage(request);

      const routes: Record<string, () => Promise<Response> | Response> = {
        '/info': () => this.getShardInfo(),
        '/users': () => request.method === 'GET' ? this.getUsersList() : new Response('Method not allowed', { status: 405 }),
        '/count': () => this.getUserCountResponse(),
        '/config': () => request.method === 'POST' ? this.handleUpdateConfig(request) : new Response('Method not allowed', { status: 405 }),
        '/cleanup': () => request.method === 'POST' ? this.handleCleanup(request) : new Response('Method not allowed', { status: 405 }),
        '/performance': () => this.getPerformanceMetrics()
      };

      return routes[url.pathname]?.() || new Response('Not found', { status: 404 });
    } catch (error) {
      handleErrorWithoutIp(error, `UserShardDO ${this.userId} fetch error`);
      return new Response("Internal Server Error", { status: 500 });
    }        
  }

  // =============================================
  // INTERNAL MESSAGE HANDLER
  // =============================================
  private async handleInternalMessage(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname.startsWith('/repository/')) {
      return await this.handleRepositoryOperations(request, url.pathname);
    }

    const body = await request.json() as { action: string; shardName?: string; [key: string]: any };
    const { action, shardName: bodyShardName, ...data } = body;
    if (bodyShardName) this.shardName = bodyShardName;

    const actions: Record<string, Function> = {
      broadcast: () => this.handleFastBroadcast(data),
      registerUser: async () => {
        const newlyRegistered = await this.registerUser(data.userId);
        return { status: 'processed', newlyRegistered };
      },
      unregisterUser: () => this.unregisterUser(data.userId)
    };

    const result = actions[action] ? await actions[action]() : undefined;
    const responseBody = result && typeof result === 'object' && 'newlyRegistered' in result
      ? result
      : { status: 'processed' };
    return new Response(JSON.stringify(responseBody));
  }

  private async handleRepositoryOperations(request: Request, path: string): Promise<Response> {
    const data = await request.json() as any;
    
    const operations: Record<string, Function> = {
      '/repository/transaction': () => this.database.execTransaction(data.operations),
      '/repository/select': async () => {
        const result = await this.database.execSelectSQL(data.sql, data.params || []);
        return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
      },
    };

    if (operations[path]) {
      const result = await operations[path]();
      return result instanceof Response ? result : new Response(JSON.stringify(result));
    }
    
    return new Response('Not found', { status: 404 });
  }

  // =============================================
  // BROADCAST MANAGEMENT (fire-and-forget)
  // =============================================
  private async handleFastBroadcast(data: any) {
    const { message, targetUsers } = data;
    const actualMessage = this.extractMessageContent(message);
    this.ctx.waitUntil(this.processFastBroadcast(actualMessage, targetUsers));
    return { status: 'accepted' };
  }

  /**
   * Chuẩn hóa message: Consumer gửi { type, message, timestamp }, BroadcastServiceDO gửi raw message.
   * Trích message content để UserDO nhận đúng format và WebSocket client parse được.
   */
  private extractMessageContent(message: any): any {
    if (
      message &&
      typeof message === 'object' &&
      'message' in message &&
      'type' in message &&
      'timestamp' in message
    ) {
      return message.message;
    }
    return message;
  }

  private async processFastBroadcast(message: any, targetUsers?: string[]) {
    const users = targetUsers
      ? await this.getSpecificUsers(targetUsers)
      : await this.getActiveUsers();

    if (users.length === 0) return;

    const batches = this.createOptimizedBatches(users);
    for (const batch of batches) {
      this.ctx.waitUntil(this.sendBatchToUsers(batch, message));
    }
  }

  private async getSpecificUsers(userIds: string[]): Promise<string[]> {
    const validUsers: string[] = [];
    for (const userId of userIds) {
      const user = await this.database.dynamicSelect("user_registrations", { field: 'userId', operator: '=', value: userId });
      const found = user.length > 0 && user[0].isActive;
      if (found) validUsers.push(userId);
    }
    return validUsers;
  }

  private async getActiveUsers(): Promise<string[]> {
    const users = await this.database.dynamicSelect("user_registrations", { field: 'isActive', operator: '=', value: 1 });
    return users.map((user: any) => user.userId);
  }

  private createOptimizedBatches(userIds: string[]): UserBatch[] {
    const chunks = this.chunkArray(userIds, this.shardConfig.BATCH_SIZE);
    return chunks.map((userIdsChunk, index) => ({
      batchId: `batch_${Date.now()}_${index}`,
      userIds: userIdsChunk,
      shardName: this.shardName,
      createdAt: Date.now(),
      size: userIdsChunk.length,
      processingOrder: index,
      priority: 'normal',
    }));
  }

  private async sendBatchToUsers(batch: UserBatch, message: any) {
    const payload = { type: 'broadcast', message, timestamp: Date.now() };
    for (const userId of batch.userIds) {
      this.ctx.waitUntil(this.sendToUser(userId, payload));
    }
  }

  private async sendToUser(userId: string, payload: any) {
    const userDO = this.env.USER_DO.get(this.env.USER_DO.idFromString(userId));
    await userDO.fetch('https://user.internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }

  // =============================================
  // USER MANAGEMENT
  // =============================================
  /** Chỉ lưu user đang online - delete khi unregister để DO storage = O(concurrent users), không phải O(total users) */
  async registerUser(userId: string): Promise<boolean> {
    const existingUser = await this.database.dynamicSelect('user_registrations', { field: 'userId', operator: '=', value: userId });
    if (existingUser.length > 0) {
      await this.database.dynamicUpdate('user_registrations', existingUser[0].id, { isActive: true });
      return false; // Idempotent: đã có (race/double register), không cần insert
    }
    const [userCount, activeCount, currentPerf] = await Promise.all([
      this.getUserCount(),
      this.getActiveUserCount(),
      this.getPerformanceMetricsData(),
    ]);
    const performanceUpdate = {
      ...currentPerf,
      shardName: this.shardName,
      totalUsers: userCount + 1,
      activeUsers: activeCount + 1,
      userGrowthRate: await this.calculateGrowthRate(),
      timestamp: Math.floor(Date.now()),
    };
    await this.database.dynamicMultiTableTransaction([
      {
        table: 'user_registrations',
        operation: 'insert',
        data: { userId, shardName: this.shardName, tags: [], priority: 'normal', isActive: true },
      },
      {
        table: 'shard_performances',
        operation: 'upsert',
        data: performanceUpdate,
      },
    ]);
    return true; // Newly registered
  }

  /** Xoá user khỏi shard khi offline - giữ DO storage nhỏ (chỉ concurrent users) */
  async unregisterUser(userId: string) {
    const existingUser = await this.database.dynamicSelect('user_registrations', { field: 'userId', operator: '=', value: userId });
    if (existingUser.length === 0) return;

    const [userCount, activeCount, currentPerf] = await Promise.all([
      this.getUserCount(),
      this.getActiveUserCount(),
      this.getPerformanceMetricsData(),
    ]);
    const performanceUpdate = {
      ...currentPerf,
      shardName: this.shardName,
      totalUsers: Math.max(0, userCount - 1),
      activeUsers: Math.max(0, activeCount - 1),
      userGrowthRate: await this.calculateGrowthRate(),
      timestamp: Math.floor(Date.now()),
    };
    await this.database.dynamicMultiTableTransaction([
      { table: 'user_registrations', operation: 'delete', id: existingUser[0].id },
      { table: 'shard_performances', operation: 'upsert', data: performanceUpdate },
    ]);
  }

  // =============================================
  // SHARD MANAGEMENT & INFO
  // =============================================
  async getShardInfo(): Promise<Response> {
    const [userCount, performance] = await Promise.all([this.getUserCount(), this.getPerformanceMetricsData()]);
    const shardInfo: ShardInfo = {
      shardName: this.shardName,
      userCount,
      config: this.shardConfig,
      timestamp: Date.now(),
      processingLoad: performance.activeUsers / (performance.totalUsers || 1),
      averageBatchTime: performance.averageProcessingTime,
      lastActivity: performance.timestamp,
      healthStatus: this.calculateHealthStatus(performance),
      errorRate: performance.errorRate || 0
    };
    return new Response(JSON.stringify(shardInfo), { headers: { 'Content-Type': 'application/json' } });
  }

  async getUsersList(): Promise<Response> {
    const users = await this.database.dynamicSelect('user_registrations');
    const userList = users ? users.map((user: any) => user.userId) : [];
    return new Response(JSON.stringify({ users: userList, count: userList.length, shardName: this.shardName }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async getUserCountResponse(): Promise<Response> {
    const [userCount, performance] = await Promise.all([this.getUserCount(), this.getPerformanceMetricsData()]);
    const response: UserCountResponse = { shardName: this.shardName, userCount, activeUsers: performance.activeUsers, timestamp: Date.now() };
    return new Response(JSON.stringify(response), { headers: { 'Content-Type': 'application/json' } });
  }

  private async getUserCount(): Promise<number> {
    const users = await this.database.dynamicSelect('user_registrations');
    return users ? users.length : 0;
  }

  private async getActiveUserCount(): Promise<number> {
    const activeUsers = await this.database.dynamicSelect('user_registrations', { field: 'isActive', operator: '=', value: 1 });
    return activeUsers.length;      
  }

  private async calculateGrowthRate(): Promise<number> {
    
    const metrics = await this.database.dynamicSelect("shard_performances");
    if (metrics.length===0) return 0;
    
    const previousTotalUsers = metrics[0].totalUsers || 0;
    const currentTotalUsers = await this.getUserCount();
    if (previousTotalUsers === 0) return currentTotalUsers > 0 ? 1.0 : 0;

    const growthRate = (currentTotalUsers - previousTotalUsers) / previousTotalUsers;
    return Math.round(growthRate * 100) / 100;
  }

  // =============================================
  // CONFIGURATION & PERFORMANCE
  // =============================================
  private async handleUpdateConfig(request: Request): Promise<Response> {
    const { scale } = await request.json() as { scale: string };
    if (!scale || !DEFAULT_SHARD_CONFIGS[scale as ShardConfigName]) throw new Error('Invalid scale');

    const previousConfig = this.shardConfigName;
    await this.updateShardConfig(scale as ShardConfigName);
    
    const response: ShardConfigResponse = {
      scale: scale as ShardConfigName,
      config: this.shardConfig,
      shardName: this.shardName,
      previousConfig,
      estimatedCapacity: this.getEstimatedCapacity()
    };
    return new Response(JSON.stringify(response), { headers: { 'Content-Type': 'application/json' } });
  }

  async updateShardConfig(scale: ShardConfigName) {
    this.shardConfigName = scale;
    this.shardConfig = DEFAULT_SHARD_CONFIGS[scale];
    
    const existingConfig = await this.database.dynamicSelect("shard_configs", { field: 'key', operator: '=', value: 'shardConfig' });
    if (existingConfig.length > 0) {
      await this.database.dynamicUpdate('shard_configs', existingConfig[0].id, DEFAULT_SHARD_CONFIGS[scale]);
    } else {
      await this.database.dynamicInsert('shard_configs', { key: 'shardConfig', ...DEFAULT_SHARD_CONFIGS[scale] });
    }
  }

  private getInitialPerformanceMetrics(): ShardPerformance {
    return {
      shardName: this.shardName,
      timestamp: Math.floor(Date.now()),
      totalUsers: 0,
      activeUsers: 0,
      userGrowthRate: 0,
      batchesProcessed: 0,
      averageBatchSize: 0,
      averageProcessingTime: 0,
      usersPerSecond: 0,
      peakThroughput: 0,
      errorRate: 0,
      retryRate: 0,
    };
  }

  /** Build metrics payload valid for DB insert (base schema only; auto-fields added by dynamicInsert). */
  private getInitialPerformanceMetricsForInsert(): ShardPerformance {
    const m = this.getInitialPerformanceMetrics();
    return ShardPerformanceSchema.parse({
      ...m,
      timestamp: Math.floor(m.timestamp),
      totalUsers: Math.floor(m.totalUsers),
      activeUsers: Math.floor(m.activeUsers),
      batchesProcessed: Math.floor(m.batchesProcessed),
    });
  }

  async getPerformanceMetrics(): Promise<Response> {
    const metrics = await this.getPerformanceMetricsData();
    return new Response(JSON.stringify(metrics), { headers: { 'Content-Type': 'application/json' } });
  }

  private async getPerformanceMetricsData(): Promise<ShardPerformance> {
    const defaults = this.getInitialPerformanceMetrics();
    const metrics = await this.database.dynamicSelect('shard_performances', { field: 'shardName', operator: '=', value: this.shardName });
    if (metrics.length===0) return defaults;
    return metrics[0] as ShardPerformance;
  }

  // =============================================
  // CLEANUP AND UTILITIES
  // =============================================
  private async handleCleanup(request: Request): Promise<Response> {
    const { inactiveUserIds, cleanupThreshold } = await request.json() as { inactiveUserIds: string[], cleanupThreshold?: number };
    if (!Array.isArray(inactiveUserIds)) throw new Error('Invalid inactive user IDs');

    const validUserIds = inactiveUserIds.filter(id => ShardValidator.isValidUserId(id));
    const operation = await this.cleanupInactiveUsers(validUserIds, cleanupThreshold);
    return new Response(JSON.stringify(operation), { headers: { 'Content-Type': 'application/json' } });
  }

  async cleanupInactiveUsers(inactiveUserIds: string[], cleanupThreshold?: number): Promise<CleanupOperation> {
    if (inactiveUserIds.length === 0) return ShardValidator.validateCleanupOperation([], this.shardName);

    const operation = ShardValidator.validateCleanupOperation(inactiveUserIds, this.shardName);
    if (cleanupThreshold) operation.cleanupThreshold = cleanupThreshold;

    try {
      let removedCount = 0;
      for (const userId of inactiveUserIds) {
        
        const userRecord = await this.database.dynamicSelect("user_registrations", { field: 'userId', operator: '=', value: userId });
        if (userRecord.length > 0) {
          await this.database.dynamicDelete('user_registrations', userRecord[0].id);
          removedCount++;
        }
      }

      operation.usersRemoved = removedCount;
      operation.usersSkipped = inactiveUserIds.length - removedCount;
      operation.status = 'completed';
      operation.processingTime = Date.now() - operation.timestamp;
      await this.database.dynamicInsert('cleanup_operations', operation);
      return operation;
      
    } catch (error) {
      operation.status = 'failed';
      operation.error = String(error);
      await this.database.dynamicInsert('cleanup_operations', operation);
      return operation;
    }
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private calculateHealthStatus(performance: ShardPerformance): 'healthy' | 'degraded' | 'unhealthy' {
    if (performance.errorRate > 0.1) return 'unhealthy';
    if (performance.errorRate > 0.05) return 'degraded';
    return 'healthy';
  }

  private getEstimatedCapacity(): string {
    const hourlyCapacity = this.shardConfig.BATCH_SIZE * (60000 / this.shardConfig.DELAY_BETWEEN_BATCHES) * 60;
    if (hourlyCapacity >= 1000000) return `${Math.round(hourlyCapacity / 1000000)}M+/hour`;
    if (hourlyCapacity >= 1000) return `${Math.round(hourlyCapacity / 1000)}K+/hour`;
    return `${hourlyCapacity}+/hour`;
  }
}