import { DurableObject } from 'cloudflare:workers';
import { z } from 'zod';
import { handleErrorWithoutIp } from '../../../shared/utils.js';
import { UserDODatabase, TableOptions } from '../../../shared/database/index.js';
import { 
  ScaleConfig, ServiceConfigSchema, ScaleConfigName, BroadcastData, 
  BroadcastDataSchema, CreateBroadcast, DeliveryRecordSchema, BroadcastAnalytics, 
  DeliveryStats, BroadcastResponse, ScaleConfigResponse, DEFAULT_SCALE_CONFIGS, 
  DEFAULT_SERVICE_CONFIG, BroadcastValidator, UserShardSchema, GlobalCounterSchema
} from '../domain';

export class BroadcastServiceDO extends DurableObject {
  protected state: DurableObjectState;
  protected storage: DurableObjectStorage;
  protected env: Env;
  protected database: UserDODatabase;
  
  private scaleConfig: ScaleConfig = DEFAULT_SCALE_CONFIGS['1M+'];
  private scaleConfigName: ScaleConfigName = '1M+';
  /** Đảm bảo bảng được tạo xong trước khi xử lý request (constructor không await được async). */
  private initializationPromise: Promise<void> | null = null;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.state = state;
    this.storage = state.storage;
    this.env = env;
    this.database = new UserDODatabase(this.storage, this.currentUserId);
    console.log("[BroadcastServiceDO] constructor", this.currentUserId);
  }

  private getInitializationPromise(): Promise<void> {
    if (!this.initializationPromise) {
      console.log("[BroadcastServiceDO] getInitializationPromise: starting initializeTables");
      this.initializationPromise = this.initializeTables();
    }
    return this.initializationPromise;
  }

  private async initializeTables(): Promise<void> {
    console.log("[BroadcastServiceDO] initializeTables: entering blockConcurrencyWhile");
    await this.state.blockConcurrencyWhile(async () => {
      // Phase 1: tạo hết các bảng trước (ensureTableExists sync)
      this.table('broadcasts', BroadcastDataSchema, {
        autoFields: { id: true, timestamps: true, user: true },
      });
      this.table('delivery_records', DeliveryRecordSchema, {
        autoFields: { id: true, timestamps: true, user: true },
      });
      this.table('service_configs', ServiceConfigSchema, {
        autoFields: { id: true, timestamps: true, user: true },
      });
      this.table('user_shards', UserShardSchema, {
        autoFields: { id: true, timestamps: true, user: true },
        conflictField: 'shardName',
      });
      this.table('global_counters', GlobalCounterSchema, {
        autoFields: { id: true, timestamps: true, user: true },
      });
      console.log("[BroadcastServiceDO] initializeTables: all tables created");
    });
    // Phase 2: bảng đã có sẵn, mới seed/load config
    console.log("[BroadcastServiceDO] initializeTables: running initialize()");
    await this.initialize();
    console.log("[BroadcastServiceDO] initializeTables: done");
  }

  // =============================================
  // GETTERS & INITIALIZATION
  // =============================================
  get currentUserId(): string { return this.state.id.toString(); }

  table<T extends z.ZodSchema>(name: string, schema: T, options?: TableOptions) {
    return this.database.table(name, schema, options);
  }

  private async initialize() {
    const initialized = await this.database.dynamicSelect('global_counters', {field: 'key', operator: '=', value: 'initialized'});
    
    if (initialized.length === 0) {
      await Promise.all([
        this.database.dynamicInsert('global_counters', { key: 'totalUsers', value: 0 }),
        this.database.dynamicInsert('global_counters', { key: 'initialized', value: 1 }),
        this.database.dynamicInsert('global_counters', { key: 'scaleConfig', value: '1M+' }),
        this.database.dynamicInsert('service_configs', DEFAULT_SERVICE_CONFIG)
      ]);
    }
    const configRecord= await this.database.dynamicSelect('global_counters', {field: 'key', operator: '=', value: 'scaleConfig'});
    if (configRecord.length === 0) {
      throw new Error('Scale config not found');
    }
    this.scaleConfigName = (configRecord[0].value as ScaleConfigName) || '1M+';
    this.scaleConfig = DEFAULT_SCALE_CONFIGS[this.scaleConfigName];
  }

  // =============================================
  // REQUEST HANDLER
  // =============================================
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    console.log(`[BroadcastServiceDO] fetch: ${url.pathname}`);
    await this.getInitializationPromise();
    console.log(`[BroadcastServiceDO] fetch: init done, handling ${url.pathname}`);
    try {
      
      if (url.hostname === 'broadcast.internal') {
        return await this.handleInternalMessage(request);
      }

      const routes: { [key: string]: Function } = {
        '/dashboard/ws/broadcast': () => request.method === 'POST' ? this.handleCreateBroadcast(request) : null,
        '/dashboard/ws/analytics': () => request.method === 'GET' ? this.getBroadcastAnalytics(parseInt(url.searchParams.get('broadcastId') || '0')) : null,
        '/dashboard/ws/scale': () => request.method === 'POST' ? this.handleUpdateScaleConfig(request) : null,
        '/dashboard/ws/health': () => this.getHealthStatus(),
        '/dashboard/ws/stats': () => this.getServiceStats()
      };

      const handler = routes[url.pathname];
      if (handler) return await handler() || new Response('Method not allowed', { status: 405 });
      
      throw new Error(`Unknown path: ${url.pathname}`);
    } catch (error) {
      handleErrorWithoutIp(error, `BroadcastServiceDO ${this.currentUserId} Fetch error`);
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

    const body = await request.json() as { action: string; [key: string]: any };
    const { action, ...data } = body;
    
    const actions: { [key: string]: Function } = {
      delivery_report: () => this.handleDeliveryReport(data),
      registerUser: () => this.registerUser(data.userId),
      unregisterUser: () => this.unregisterUser(data.userId)
    };

    if (actions[action]) await actions[action]();
    return new Response(JSON.stringify({ status: 'processed' }));
  }

  private async handleRepositoryOperations(request: Request, path: string): Promise<Response> {
    const data = await request.json() as any;
    
    const operations: { [key: string]: Function } = {
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

  private async handleDeliveryReport(data: any) {
    const { broadcastId, deliveredCount } = data;
    if (broadcastId && deliveredCount) {
      await this.updateDeliveryCount(broadcastId, deliveredCount);
    }
  }

  // =============================================
  // BROADCAST MANAGEMENT
  // =============================================
  private async handleCreateBroadcast(request: Request): Promise<Response> {
    const createData: CreateBroadcast = BroadcastValidator.validateCreateBroadcast(await request.json());
    console.log(`[BroadcastServiceDO] handleCreateBroadcast: received targetUsersCount=${createData.targetUsers?.length ?? 'all'} priority=${createData.priority} expiresIn=${createData.expiresIn}`);
    const broadcastId = await this.createBroadcast(createData);
    console.log(`[BroadcastServiceDO] handleCreateBroadcast: created broadcastId=${broadcastId}`);

    const response: BroadcastResponse = {
      broadcastId,
      status: 'started',
      config: this.scaleConfig,
      estimatedUsers: await this.getTotalUsers(),
      queuePosition: 0
    };

    return new Response(JSON.stringify(response), { headers: { 'Content-Type': 'application/json' } });
  }

  async createBroadcast(createData: CreateBroadcast): Promise<number> {
    const broadcastData: BroadcastData = {
      message: createData.message,
      timestamp: Date.now(),
      status: 'pending',
      delivered: 0,
      total: createData.targetUsers?.length || 0,
      targetUsers: createData.targetUsers || null,
      priority: createData.priority || 'normal',
      expiresAt: createData.expiresIn ? Date.now() + createData.expiresIn : undefined,
      retryCount: 0
    };
    const broadcast = await this.database.dynamicInsert('broadcasts', broadcastData);
    console.log(`[BroadcastServiceDO] createBroadcast: inserted broadcastId=${broadcast.id}`);
    this.ctx.waitUntil(this.processBroadcastWithMessage(broadcast.id, broadcast.message, createData.targetUsers));

    return broadcast.id;
  }

  private async processBroadcastWithMessage(broadcastId: number, message: any, targetUsers?: string[]) {
    console.log(`[BroadcastServiceDO] processBroadcastWithMessage: start broadcastId=${broadcastId} targetUsersCount=${targetUsers?.length ?? 'all'}`);
    try {
      let broadcastDataArr = await this.database.dynamicSelect('broadcasts', { field: 'id', operator: '=', value: broadcastId });
      if (broadcastDataArr.length === 0) throw new Error(`Broadcast ${broadcastId} not found`);
      if (broadcastDataArr[0].status === 'completed') return;
      let broadcastData = broadcastDataArr[0]
      broadcastData.status = 'processing';
      broadcastData.startedAt = Date.now();
      await this.database.dynamicUpdate('broadcasts', broadcastId, broadcastData);

      let userShards: string[];
      let totalUsers = 0;

      if (targetUsers) {
        const shardMap = new Map<string, string[]>();
        for (const userId of targetUsers) {
          const shardName = this.getShardForUser(userId);
          if (!shardMap.has(shardName)) shardMap.set(shardName, []);
          shardMap.get(shardName)!.push(userId);
        }
        userShards = Array.from(shardMap.keys());
        totalUsers = targetUsers.length;        
      } else {
        userShards = await this.getAllShards();
        totalUsers = await this.getTotalUsers();
      }

      broadcastData.total = totalUsers;
      await this.database.dynamicUpdate('broadcasts', broadcastId, broadcastData);
      console.log(`[BroadcastServiceDO] processBroadcastWithMessage: totalUsers=${totalUsers} shards=${userShards.length} shardNames=${JSON.stringify(userShards)}`);

      const broadcastPayload = { broadcastId, message, timestamp: Date.now(), targetUsers, expiresAt: broadcastData.expiresAt, priority: broadcastData.priority };
      await this.broadcastToShards(userShards, broadcastPayload);
      console.log(`[BroadcastServiceDO] processBroadcastWithMessage: broadcastToShards dispatched broadcastId=${broadcastId}`);

    } catch (error) {
      await this.markBroadcastFailed(broadcastId, error);
    }
  }

  private async broadcastToShards(shards: string[], payload: any) {
    console.log(`[BroadcastServiceDO] broadcastToShards: sending to shards broadcastId=${payload.broadcastId} shardCount=${shards.length} shards=${JSON.stringify(shards)}`);
    const shardPromises = shards.map(shardName =>
      this.sendToShard(shardName, 'broadcast', payload)
    );
    this.ctx.waitUntil(Promise.allSettled(shardPromises));
  }

  private async sendToShard(shardName: string, action: string, data: any) {
    console.log(`[BroadcastServiceDO] sendToShard: calling shard shardName=${shardName} action=${action} broadcastId=${data.broadcastId}`);
    const shardDO = this.env.USER_SHARD_DO.get(this.env.USER_SHARD_DO.idFromName(shardName));
    const response = await shardDO.fetch('https://shard.internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...data, shardName })
    });    
    if (!response.ok) throw new Error(`Failed to send broadcast to shard ${shardName}: ${response.statusText}`);
  }

  // =============================================
  // USER MANAGEMENT
  // =============================================
  async registerUser(userId: string) {
    const shardName = this.getShardForUser(userId);
    const [existingShardArr, totalUsersCounterArr] = await Promise.all([
      this.database.dynamicSelect('user_shards', { field: 'shardName', operator: '=', value: shardName }),
      this.database.dynamicSelect('global_counters', { field: 'key', operator: '=', value: 'totalUsers' })
    ]);
    if (totalUsersCounterArr.length===0) throw new Error('Total users counter not found');
    let existingShard: any;
    if (existingShardArr.length===0) {
      existingShard = await this.database.dynamicInsert('user_shards', { shardName, userCount: 0 });
    }
    else existingShard = existingShardArr[0];    
    const totalUsersCounter = totalUsersCounterArr[0];
    const currentTotalUsers = Number(totalUsersCounter.value ?? 0) || 0;

    await this.database.dynamicMultiTableTransaction([
      {
        table: 'user_shards',
        operation: 'upsert',
        data: { shardName, userCount: existingShard.userCount + 1 }
      },
      {
        table: 'global_counters',
        operation: 'update',
        id: totalUsersCounter.id,
        // NOTE: `global_counters.value` is currently modeled as `z.any()` => column type TEXT,
        // so Cloudflare SQLite may return strings like "0.01". Always coerce to number before incrementing.
        data: { value: currentTotalUsers + 1 }
      }
    ]);

    await this.executeShardOperation('registerUser', userId, shardName, existingShard, totalUsersCounter);
  }

  async unregisterUser(userId: string) {
    const shardName = this.getShardForUser(userId);
    const [existingShardArr, totalUsersCounterArr] = await Promise.all([
      this.database.dynamicSelect('user_shards', { field: 'shardName', operator: '=', value: shardName }),
      this.database.dynamicSelect('global_counters', { field: 'key', operator: '=', value: 'totalUsers' })
    ]);
    if (totalUsersCounterArr.length===0) throw new Error('Total users counter not found');
    let existingShard: any;
    if (existingShardArr.length===0) {
      existingShard = await this.database.dynamicInsert('user_shards', { shardName, userCount: 1 });
    }
    else existingShard = existingShardArr[0];    
    const totalUsersCounter = totalUsersCounterArr[0];
    const currentTotalUsers = Number(totalUsersCounter.value ?? 0) || 0;

    await this.database.dynamicMultiTableTransaction([
      {
        table: 'user_shards',
        operation: 'update',
        id: existingShard.id,
        data: { userCount: Math.max(0, existingShard.userCount - 1) }
      },
      {
        table: 'global_counters', 
        operation: 'update',
        id: totalUsersCounter.id,
        data: { value: Math.max(0, currentTotalUsers - 1) }
      }
    ]);

    await this.executeShardOperation('unregisterUser', userId, shardName, existingShard, totalUsersCounter);
  }

  private async executeShardOperation(action: 'registerUser' | 'unregisterUser', userId: string, shardName: string, existingShard: any, totalUsersCounter: any) {
    console.log(`[BroadcastServiceDO] executeShardOperation: ${action} ${userId} ${shardName}`);
    const shardDO = this.env.USER_SHARD_DO.get(this.env.USER_SHARD_DO.idFromName(shardName));
    // Gọi init qua fetch vì stub không chuyển method call (RPC) tới DO; gửi shardName trong body để shard tự set tên
    const response = await shardDO.fetch('https://shard.internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, userId, shardName })
    });
    console.log(`[BroadcastServiceDO] executeShardOperation: response: ${response.status} ${response.statusText}`);
    if (!response.ok) {
      await this.database.dynamicMultiTableTransaction([
        {
          table: 'user_shards',
          operation: 'update',
          id: existingShard.id,
          data: { shardName, userCount: existingShard.userCount }
        },
        {
          table: 'global_counters',
          operation: 'update', 
          id: totalUsersCounter.id,
          data: { value: totalUsersCounter.value }
        }
      ]);
      throw new Error(`Failed to ${action}: ${response.statusText}`);
    }
  }

  // =============================================
  // DELIVERY TRACKING & ANALYTICS
  // =============================================
  private async updateDeliveryCount(broadcastId: number, deliveredCount: number) {
    const broadcastDataArr= await this.database.dynamicSelect('broadcasts', { field: 'id', operator: '=', value: broadcastId });
    if (broadcastDataArr.length === 0) throw new Error(`Broadcast ${broadcastId} not found`); 
    const broadcastData = broadcastDataArr[0];
    if (broadcastData?.status === 'processing') {
      const newDelivered = (broadcastData.delivered || 0) + deliveredCount;
      const updates: any = {
        delivered: newDelivered,
        lastDeliveryTime: Date.now()
      };

      if (broadcastData.total > 0 && newDelivered >= broadcastData.total) {
        updates.status = 'completed';
        updates.completedAt = Date.now();
      }
      await this.database.dynamicUpdate('broadcasts', broadcastId, updates);
    }
  }

  async getBroadcastAnalytics(broadcastId: number): Promise<Response> {
    if (!BroadcastValidator.validateBroadcastId(broadcastId)) {
      throw new Error('Invalid broadcast ID');
    }

    const stats = await this.getDeliveryStats(broadcastId);
    if (!stats) throw new Error('Broadcast not found');

    const estimatedCompletionSeconds = stats.deliveryRate > 0 ? stats.pending / stats.deliveryRate : Infinity;
    const analytics: BroadcastAnalytics = {
      ...stats,
      estimatedCompletionSeconds,
      estimatedCompletionTime: isFinite(estimatedCompletionSeconds) ? new Date(Date.now() + estimatedCompletionSeconds * 1000).toISOString() : null,
      status: stats.completionPercentage === 100 ? 'completed' : stats.deliveryRate > 0 ? 'in_progress' : 'stalled',
      shardProgress: await this.getShardProgress(broadcastId),
      failed: 0,
      elapsedSeconds: (Date.now() - stats.startTime) / 1000        
    };

    return new Response(JSON.stringify(analytics), { headers: { 'Content-Type': 'application/json' } });
  }

  private async getDeliveryStats(broadcastId: number): Promise<DeliveryStats | null> {
    const dataArr = await this.database.dynamicSelect('broadcasts', { field: 'id', operator: '=', value: broadcastId });
    if (dataArr.length === 0) return null;
    const data = dataArr[0];
    
    const startTime = data.startedAt || data.timestamp;
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = elapsed > 0 ? data.delivered / elapsed : 0;
    
    const deliveries = await this.database.execSelectSQL(
      `SELECT userId, deliveredAt FROM delivery_records WHERE broadcastId = ? LIMIT 10`,
      [broadcastId],
      'delivery_records'
    )

    return {
      broadcastId,
      totalUsers: data.total,
      delivered: data.delivered,
      pending: Math.max(0, data.total - data.delivered),
      deliveryRate: Math.round(rate * 100) / 100,
      completionPercentage: data.total > 0 ? Math.round((data.delivered / data.total) * 100) : 0,
      startTime,
      currentTime: Date.now(),
      sampleDeliveries: deliveries.map((record: any) => ({
        userId: record.userId,
        deliveredAt: new Date(record.deliveredAt).toISOString()
      }))
    };
  }

  private async getShardProgress(broadcastId: number) {
    const [deliveries, allShards] = await Promise.all([
      this.database.execSelectSQL(
            `SELECT userId, deliveredAt FROM delivery_records WHERE broadcastId = ? LIMIT 1000`,
            [broadcastId],
            'delivery_records'
          ),
      this.database.dynamicSelect('user_shards')
    ]);

    const shardCounts = new Map<string, { delivered: number, total: number }>();
    
    for (const record of deliveries) {
      const shardName = record.shardName;
      const current = shardCounts.get(shardName) || { delivered: 0, total: 0 };
      current.delivered++;
      shardCounts.set(shardName, current);
    }

    for (const shard of allShards) {
      const counts = shardCounts.get(shard.shardName) || { delivered: 0, total: 0 };
      counts.total = shard.userCount;
      shardCounts.set(shard.shardName, counts);
    }

    const result: Record<string, { delivered: number, total: number, percentage: number }> = {};
    for (const [shardName, counts] of shardCounts.entries()) {
      result[shardName] = {
        delivered: counts.delivered,
        total: counts.total,
        percentage: counts.total > 0 ? Math.round((counts.delivered / counts.total) * 100) : 0
      };
    }

    return result;
  }

  // =============================================
  // SCALING & HEALTH
  // =============================================
  private async handleUpdateScaleConfig(request: Request): Promise<Response> {
    const { scale } = await request.json() as { scale: string };
    if (!scale || !DEFAULT_SCALE_CONFIGS[scale as ScaleConfigName]) {
      throw new Error('Invalid scale');
    }

    const previousScale = this.scaleConfigName;
    await this.updateScaleConfig(scale as ScaleConfigName);
    
    const response: ScaleConfigResponse = {
      scale: scale as ScaleConfigName,
      config: this.scaleConfig,
      previousScale,
      estimatedCapacity: this.getEstimatedCapacity()
    };

    return new Response(JSON.stringify(response), { headers: { 'Content-Type': 'application/json' } });
  }

  async updateScaleConfig(scale: ScaleConfigName) {
    this.scaleConfigName = scale;
    this.scaleConfig = DEFAULT_SCALE_CONFIGS[scale];
    
    const configRecord = await this.database.dynamicSelect("global_counters", { field: 'key', operator: '=', value: 'scaleConfigName' });
    if (configRecord.length > 0) {
      await this.database.dynamicUpdate('global_counters',  configRecord[0].id, { value: scale });
    } else {
      await this.database.dynamicInsert('global_counters', { key: 'scaleConfigName', value: scale });
    } 
  }

  private getEstimatedCapacity(): string {
    const totalCapacity = this.scaleConfig.SHARD_COUNT * 1000;
    if (totalCapacity >= 1000000) return `${Math.round(totalCapacity / 1000000)}M+`;
    if (totalCapacity >= 1000) return `${Math.round(totalCapacity / 1000)}K+`;
    return `${totalCapacity}+`;
  }

  async getHealthStatus(): Promise<Response> {
    const [totalUsers, activeShards, serviceConfig] = await Promise.all([
      this.getTotalUsers(),
      this.getAllShards(),
      this.database.dynamicSelect("service_configs", { field: 'scaleConfig', operator: '=', value: this.scaleConfigName })
    ]);

    const health = {
      status: 'healthy' as const,
      timestamp: Date.now(),
      metrics: { totalUsers, activeShards: activeShards.length, scaleConfig: this.scaleConfigName, deliveryRate: 0 },
      config: serviceConfig
    };

    return new Response(JSON.stringify(health), { headers: { 'Content-Type': 'application/json' } });
  }

  async getServiceStats(): Promise<Response> {
    const [totalUsers, activeShards, recentBroadcasts] = await Promise.all([
      this.getTotalUsers(),
      this.getAllShards(),
      this.getRecentBroadcasts(10)
    ]);

    const stats = { totalUsers, activeShards: activeShards.length, scaleConfig: this.scaleConfigName, recentBroadcasts, timestamp: Date.now() };
    return new Response(JSON.stringify(stats), { headers: { 'Content-Type': 'application/json' } });
  }

  private async getRecentBroadcasts(limit: number) {
    const broadcasts = await this.database.dynamicSelect('broadcasts');
    return broadcasts
      .sort((a: any, b: any) => b.timestamp - a.timestamp)
      .slice(0, limit)
      .map((broadcast: any) => ({
        broadcastId: broadcast.id,
        status: broadcast.status,
        delivered: broadcast.delivered,
        total: broadcast.total,
        timestamp: broadcast.timestamp
      }));
  }

  // =============================================
  // UTILITY METHODS
  // =============================================
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

  private async getAllShards(): Promise<string[]> {
    const shards = await this.database.dynamicSelect('user_shards');
    return shards.map((shard: any) => shard.shardName);
  }

  private async getTotalUsers(): Promise<number> {
    const counter = await this.database.dynamicSelect("global_counters", { field: 'key', operator: '=', value: 'totalUsers' });
    return counter.length > 0 ? (Number(counter[0].value ?? 0) || 0) : 0;
  }

  private async markBroadcastFailed(broadcastId: number, error: any) {
    await this.database.dynamicUpdate("broadcasts", broadcastId, { status: 'failed', error: error.message });
  }
}