/* eslint-disable */
// Env for consumer-worker - run "wrangler types" to regenerate
declare namespace Cloudflare {
  interface Env {
    USER_SHARD_DO: DurableObjectNamespace;
    SHARD_COUNT?: string;
  }
}
interface Env extends Cloudflare.Env {}

// Cloudflare Queue types (from @cloudflare/workers-types)
// Named QueueMessage to avoid conflict with DOM Message interface
interface QueueRetryOptions {
  delaySeconds?: number;
}
interface QueueMessage<Body = unknown> {
  readonly id: string;
  readonly timestamp: Date;
  readonly body: Body;
  readonly attempts: number;
  retry(options?: QueueRetryOptions): void;
  ack(): void;
}
interface MessageBatch<Body = unknown> {
  readonly messages: readonly QueueMessage<Body>[];
  readonly queue: string;
  retryAll(options?: QueueRetryOptions): void;
  ackAll(): void;
}

// Cloudflare Worker export type
type ExportedHandlerQueueHandler<Env = unknown, Msg = unknown> = (
  batch: MessageBatch<Msg>,
  env: Env,
  ctx: ExecutionContext
) => void | Promise<void>;
interface ExportedHandler<Env = unknown, QueueHandlerMessage = unknown> {
  fetch?: (request: Request, env: Env, ctx: ExecutionContext) => Response | Promise<Response>;
  queue?: ExportedHandlerQueueHandler<Env, QueueHandlerMessage>;
}
