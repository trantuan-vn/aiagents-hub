/// <reference path="../worker-configuration.d.ts" />
import { createLogger } from './shared/logger';

const log = createLogger('consumer-worker');

/**
 * Consumer worker: consumes aiagents-hub-ws-broadcast-queue, parses by type (heartbeats, notifications, prices, etc.),
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
      log.warn('consumer.parse_invalid', { hasTargetUsers: Array.isArray((raw as any)?.targetUsers) });
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
    log.error('consumer.parse_failed', e instanceof Error ? e : { error: String(e) });
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
  let processed = 0;
  let skipped = 0;
  let totalUsers = 0;

  for (const msg of batch.messages) {
    try {
      const parsed = parseMessage(msg.body);
      if (!parsed) {
        msg.ack();
        continue;
      }

      const { type, targetUsers, message } = parsed;
      if (targetUsers.length === 0) {
        log.warn('consumer.empty_targets', { type });
        skipped++;
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
      processed++;
      totalUsers += targetUsers.length;
      msg.ack();
    } catch (e) {
      log.error('consumer.message_failed', e instanceof Error ? e : { error: String(e) });
      msg.retry();
    }
  }

  log.info('consumer.batch_complete', {
    queue: batch.queue,
    messages: batch.messages.length,
    processed,
    skipped,
    totalUsers,
    shardCount,
  });
}

async function processDlq(batch: MessageBatch): Promise<void> {
  for (const msg of batch.messages) {
    try {
      log.error('consumer.dlq_entry', { messageId: msg.id, type: (msg.body as any)?.type });
      msg.ack();
    } catch (e) {
      log.error('consumer.dlq_process_failed', e instanceof Error ? e : { error: String(e) });
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

    const handlers: Record<string, (batch: MessageBatch, env: Env) => Promise<void>> = {
      'aiagents-hub-ws-broadcast-queue': processWsBroadcastQueue,
      'aiagents-hub-ws-broadcast-dlq': processDlq,
    };

    const handler = handlers[batch.queue];
    if (handler) {
      await handler(batch, env);
    } else {
      log.warn('consumer.unknown_queue', { queue: batch.queue, messages: batch.messages.length });
      batch.messages.forEach((m) => m.ack());
    }
  },
} as ExportedHandler<Env>;
