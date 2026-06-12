import { findWebhookTrigger, runTrigger, type WorkflowTriggerRow } from '../../triggers.js';

export const WEBHOOK_TRIGGER_TYPE = 'webhook';

export type WebhookHandleResult =
  | { notFound: true }
  | {
      notFound: false;
      status: string;
      executionKey: string;
      output?: unknown;
    };

/** Parse request body/query into workflow trigger input. */
export async function parseWebhookInput(
  request: Request,
  trigger: WorkflowTriggerRow,
): Promise<string> {
  const url = new URL(request.url);
  let input = url.searchParams.get('input') ?? '';
  if (!input) {
    const raw = await request.text().catch(() => '');
    input = raw || trigger.input || '';
  }
  return input;
}

/** Handle an incoming webhook HTTP request (GET or POST). */
export async function handleWebhookRequest(
  env: Env,
  bindingName: string,
  db: D1Database,
  ownerId: string,
  token: string,
  request: Request,
): Promise<WebhookHandleResult> {
  const trigger = await findWebhookTrigger(db, ownerId, token);
  if (!trigger) return { notFound: true };

  const input = await parseWebhookInput(request, trigger);
  const result = await runTrigger(env, bindingName, trigger, input);
  return {
    notFound: false,
    status: result.status,
    executionKey: result.executionKey,
    output: result.output,
  };
}
