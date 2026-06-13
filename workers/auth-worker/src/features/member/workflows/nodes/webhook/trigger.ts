import {
  findWebhookTrigger,
  findWebhookTriggerByWorkflowId,
  runTrigger,
  type WorkflowTriggerRow,
} from '../../triggers.js';
import type { ValidatedWebhookToken } from '../../webhook-auth.js';
import { broadcastWorkflowWebhookResult } from '../../webhook-notify.js';
import {
  buildWebhookItemOutput,
  parseWebhookRequest,
} from './output.js';

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
  const { input } = await parseWebhookRequest(request, trigger, { executionMode: 'test' });
  return input;
}

/** Handle an incoming webhook HTTP request (GET or POST) — legacy ownerId + token URL. */
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

  const { input, itemParams } = await parseWebhookRequest(request, trigger, { executionMode: 'production' });
  const result = await runTrigger(env, bindingName, trigger, input, itemParams);
  return {
    notFound: false,
    status: result.status,
    executionKey: result.executionKey,
    output: result.output,
  };
}

/** Handle webhook by workflow id after API token auth (owner resolved from D1). */
export async function handleWebhookRequestByWorkflowId(
  env: Env,
  bindingName: string,
  db: D1Database,
  workflowId: number,
  ownerId: string,
  webhookPath: string | undefined,
  request: Request,
  _auth: ValidatedWebhookToken,
): Promise<WebhookHandleResult> {
  const trigger = await findWebhookTriggerByWorkflowId(db, workflowId, ownerId, webhookPath);
  if (!trigger) return { notFound: true };

  const { input, itemParams } = await parseWebhookRequest(request, trigger, { executionMode: 'test' });
  const webhookItem = buildWebhookItemOutput(itemParams);
  const result = await runTrigger(env, bindingName, trigger, input, itemParams);

  await broadcastWorkflowWebhookResult(env, bindingName, ownerId, {
    workflowId,
    nodeId: trigger.nodeId,
    webhookPath: trigger.webhookPath ?? webhookPath ?? null,
    executionKey: result.executionKey,
    status: result.status,
    input,
    output: webhookItem,
    receivedAt: Date.now(),
    method: request.method,
  });

  return {
    notFound: false,
    status: result.status,
    executionKey: result.executionKey,
    output: result.output,
  };
}
