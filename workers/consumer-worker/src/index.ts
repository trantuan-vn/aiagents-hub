/// <reference path="../worker-configuration.d.ts" />
/**
 * Consumer worker: consumes ws-broadcast-queue, parses by type (heartbeats, notifications, prices, etc.),
 * computes shards from targetUsers, and calls UserShardDO.handleFastBroadcast
 */

const DEFAULT_SHARD_COUNT = 1000;

function consistentHash(str: string, buckets: number): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % buckets;
}

function getShardForUser(userId: string, shardCount: number): string {
  const hash = consistentHash(userId, shardCount);
  return `shard-${hash}`;
}

/** Message types from queue */
type WsBroadcastType = 'heartbeat' | 'notification' | 'price' | 'broadcast' | string;

interface WsBroadcastMessage {
  type?: WsBroadcastType;
  targetUsers: string[];
  message: unknown;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  expiresIn?: number;
}

function parseMessage(body: unknown): WsBroadcastMessage | null {
  try {
    let raw: Record<string, unknown>;
    if (typeof body === 'string') {
      raw = JSON.parse(body) as Record<string, unknown>;
    } else if (body && typeof body === 'object' && 'body' in body && typeof (body as { body: unknown }).body === 'string') {
      // Legacy: producer used queue.send({ body: JSON.stringify(...) }), unwrap
      raw = JSON.parse((body as { body: string }).body) as Record<string, unknown>;
    } else {
      raw = (body ?? {}) as Record<string, unknown>;
    }
    if (!raw || !Array.isArray(raw.targetUsers)) {
      console.warn('[ConsumerWorker] Invalid message: targetUsers required', body);
      return null;
    }
    return {
      type: (raw.type as WsBroadcastType) ?? 'broadcast',
      targetUsers: raw.targetUsers as string[],
      message: raw.message ?? raw,
      priority: raw.priority as WsBroadcastMessage['priority'],
      expiresIn: raw.expiresIn as number | undefined,
    };
  } catch (e) {
    console.error('[ConsumerWorker] Failed to parse message:', e);
    return null;
  }
}

/** Group targetUsers by shard */
function groupByShard(
  targetUsers: string[],
  shardCount: number
): Map<string, string[]> {
  const shardMap = new Map<string, string[]>();
  for (const userId of targetUsers) {
    const shardName = getShardForUser(userId, shardCount);
    if (!shardMap.has(shardName)) shardMap.set(shardName, []);
    shardMap.get(shardName)!.push(userId);
  }
  return shardMap;
}

async function sendToShard(
  env: Env,
  shardName: string,
  message: unknown,
  targetUsers: string[]
): Promise<void> {
  const shardDO = env.USER_SHARD_DO.get(env.USER_SHARD_DO.idFromName(shardName));
  await shardDO.fetch('https://shard.internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'broadcast',
      message,
      targetUsers,
      shardName,
    }),
  });
}

async function processWsBroadcastQueue(batch: MessageBatch, env: Env): Promise<void> {
  const shardCount = parseInt(env.SHARD_COUNT ?? String(DEFAULT_SHARD_COUNT), 10) || DEFAULT_SHARD_COUNT;

  for (const msg of batch.messages) {
    try {
      const parsed = parseMessage(msg.body);
      if (!parsed) {
        msg.ack();
        continue;
      }

      const { type, targetUsers, message } = parsed;
      if (targetUsers.length === 0) {
        console.warn('[ConsumerWorker] Skipping message with empty targetUsers:', type);
        msg.ack();
        continue;
      }

      const payload = {
        type: type ?? 'broadcast',
        message,
        timestamp: Date.now(),
      };

      const shardMap = groupByShard(targetUsers, shardCount);
      const sendPromises = Array.from(shardMap.entries()).map(([shardName, users]) =>
        sendToShard(env, shardName, payload, users)
      );

      await Promise.allSettled(sendPromises);
      msg.ack();
      console.log(`[ConsumerWorker] Processed ${type} for ${targetUsers.length} users across ${shardMap.size} shards`);
    } catch (e) {
      console.error('[ConsumerWorker] Failed to process message:', e);
      msg.retry();
    }
  }
}

async function processDlq(batch: MessageBatch): Promise<void> {
  for (const msg of batch.messages) {
    try {
      console.error('[ConsumerWorker] DLQ message:', msg.id, msg.body);
      msg.ack();
    } catch (e) {
      console.error('[ConsumerWorker] DLQ process error:', e);
      msg.ack();
    }
  }
}

const handleHttpRequest = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  if (url.pathname === '/health') {
    return new Response(
      JSON.stringify({
        status: 'healthy',
        service: 'Consumer Worker',
        timestamp: Date.now(),
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }
  return new Response('Consumer Worker - Available: /health', { status: 404 });
};

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    return handleHttpRequest(req);
  },

  async queue(batch: MessageBatch, env: Env): Promise<void> {
    console.log(`[ConsumerWorker] Processing ${batch.queue} with ${batch.messages.length} messages`);

    const handlers: Record<string, (batch: MessageBatch, env: Env) => Promise<void>> = {
      'ws-broadcast-queue': processWsBroadcastQueue,
      'ws-broadcast-dlq': processDlq,
    };

    const handler = handlers[batch.queue];
    if (handler) {
      await handler(batch, env);
    } else {
      console.warn(`[ConsumerWorker] Unknown queue: ${batch.queue}`);
      batch.messages.forEach((m) => m.ack());
    }
  },
} as ExportedHandler<Env>;
