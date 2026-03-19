import { DurableObject } from 'cloudflare:workers';
import { z } from 'zod';
import { handleErrorWithoutIp } from '../../../shared/utils.js';
import { UserDODatabase, TableOptions } from '../../../shared/database/index.js';
import { 
  ScaleConfig, ServiceConfigSchema, ScaleConfigName, CreateBroadcast, 
  BroadcastResponse, ScaleConfigResponse, DEFAULT_SCALE_CONFIGS, 
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

    // Read request body IMMEDIATELY before any long-running work (e.g. getInitializationPromise).
    // If we delay, the client may disconnect and we get "Can't read from request stream because client disconnected".
    let createBroadcastBody: unknown = null;
    let updateScaleBody: unknown = null;
    if (url.pathname === '/dashboard/ws/broadcast' && request.method === 'POST') {
      createBroadcastBody = await request.json();
    } else if (url.pathname === '/dashboard/ws/scale' && request.method === 'POST') {
      updateScaleBody = await request.json();
    }

    await this.getInitializationPromise();
    console.log(`[BroadcastServiceDO] fetch: init done, handling ${url.pathname}`);
    try {
      
      if (url.hostname === 'broadcast.internal') {
        return await this.handleInternalMessage(request);
      }

      const routes: { [key: string]: Function } = {
        '/dashboard/ws/broadcast': () => request.method === 'POST' && createBroadcastBody !== null ? this.handleCreateBroadcast(createBroadcastBody) : null,
        '/dashboard/ws/scale': () => request.method === 'POST' && updateScaleBody !== null ? this.handleUpdateScaleConfig(updateScaleBody) : null,
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

  // =============================================
  // BROADCAST MANAGEMENT (fire-and-forget)
  // =============================================
  private async handleCreateBroadcast(body: unknown): Promise<Response> {
    const createData: CreateBroadcast = BroadcastValidator.validateCreateBroadcast(body);
    console.log(`[BroadcastServiceDO] handleCreateBroadcast: targetUsersCount=${createData.targetUsers?.length ?? 'all'} priority=${createData.priority}`);
    
    let userShards: string[];
    if (createData.targetUsers?.length) {
      const shardMap = new Map<string, string[]>();
      for (const userId of createData.targetUsers) {
        const shardName = this.getShardForUser(userId);
        if (!shardMap.has(shardName)) shardMap.set(shardName, []);
        shardMap.get(shardName)!.push(userId);
      }
      userShards = Array.from(shardMap.keys());
    } else {
      // Broadcast to all: lấy shards từ user_shards (đã có user đăng ký).
      // Fallback: nếu bảng trống (chưa có registerUser nào), iterate qua tất cả shards để đảm bảo không bỏ sót client.
      userShards = await this.getAllShards();
      if (userShards.length === 0) {
        console.log('[BroadcastServiceDO] handleCreateBroadcast: getAllShards returned empty, falling back to all shards');
        userShards = this.getAllShardNames();
      }
    }

    const payload = {
      message: createData.message,
      timestamp: Date.now(),
      targetUsers: createData.targetUsers ?? null,
      expiresAt: createData.expiresIn ? Date.now() + createData.expiresIn : undefined,
      priority: createData.priority || 'normal',
    };
    
    // Fire-and-forget: gửi xong quên, không await
    console.log(`[BroadcastServiceDO] handleCreateBroadcast: dispatching to ${userShards.length} shards`);
    for (const shardName of userShards) {
      this.ctx.waitUntil(this.sendToShard(shardName, 'broadcast', payload));
    }

    const response: BroadcastResponse = {
      status: 'dispatched',
      config: this.scaleConfig,
      estimatedUsers: await this.getTotalUsers(),
    };
    return new Response(JSON.stringify(response), { headers: { 'Content-Type': 'application/json' } });
  }

  private async sendToShard(shardName: string, action: string, data: any) {
    const shardDO = this.env.USER_SHARD_DO.get(this.env.USER_SHARD_DO.idFromName(shardName));
    await shardDO.fetch('https://shard.internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...data, shardName })
    });
  }

  // =============================================
  // USER MANAGEMENT
  // =============================================
  /** Idempotent: chỉ tăng userCount khi UserShardDO xác nhận đây là đăng ký MỚI (user chưa có trong user_registrations).
   * UserShardDO đã idempotent - gọi register nhiều lần cho cùng user chỉ insert 1 lần. BroadcastServiceDO phải đồng bộ:
   * mỗi lần registerUser được gọi, nếu UserShardDO báo "đã có sẵn" thì không tăng counter. */
  async registerUser(userId: string) {
    const shardName = this.getShardForUser(userId);
    const shardDO = this.env.USER_SHARD_DO.get(this.env.USER_SHARD_DO.idFromName(shardName));
    const response = await shardDO.fetch('https://shard.internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'registerUser', userId, shardName })
    });
    if (!response.ok) throw new Error(`Failed to register user: ${response.statusText}`);

    const body = (await response.json()) as { status?: string; newlyRegistered?: boolean };
    if (body.newlyRegistered !== true) return; // Idempotent: user đã có trong shard, không tăng counter

    const [existingShardArr, totalUsersCounterArr] = await Promise.all([
      this.database.dynamicSelect('user_shards', { field: 'shardName', operator: '=', value: shardName }),
      this.database.dynamicSelect('global_counters', { field: 'key', operator: '=', value: 'totalUsers' })
    ]);
    if (totalUsersCounterArr.length === 0) throw new Error('Total users counter not found');
    let existingShard: any;
    if (existingShardArr.length === 0) {
      existingShard = await this.database.dynamicInsert('user_shards', { shardName, userCount: 0 });
    } else existingShard = existingShardArr[0];
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
        data: { value: currentTotalUsers + 1 }
      }
    ]);
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
  // SCALING & HEALTH
  // =============================================
  private async handleUpdateScaleConfig(body: unknown): Promise<Response> {
    const { scale } = body as { scale: string };
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
    const [totalUsers, activeShards] = await Promise.all([
      this.getTotalUsers(),
      this.getAllShards(),
    ]);
    const stats = { totalUsers, activeShards: activeShards.length, scaleConfig: this.scaleConfigName, timestamp: Date.now() };
    return new Response(JSON.stringify(stats), { headers: { 'Content-Type': 'application/json' } });
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
    return shards
      .filter((shard: any) => (shard.userCount ?? 0) > 0)
      .map((shard: any) => shard.shardName);
  }

  /** Trả về tất cả shard names theo scale config (dùng khi broadcast all nhưng user_shards trống). */
  private getAllShardNames(): string[] {
    const count = this.scaleConfig.SHARD_COUNT;
    return Array.from({ length: count }, (_, i) => `shard-${i}`);
  }

  private async getTotalUsers(): Promise<number> {
    const counter = await this.database.dynamicSelect("global_counters", { field: 'key', operator: '=', value: 'totalUsers' });
    return counter.length > 0 ? (Number(counter[0].value ?? 0) || 0) : 0;
  }
}