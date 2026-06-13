import type { WorkflowNodePlugin } from '../types.js';
import { findWebhookTrigger } from '../../triggers.js';
import { parseWebhookInput, WEBHOOK_TRIGGER_TYPE } from './trigger.js';

export {
  handleWebhookRequest,
  handleWebhookRequestByWorkflowId,
  parseWebhookInput,
  parseWebhookRequest,
  WEBHOOK_TRIGGER_TYPE,
} from './trigger.js';
export {
  buildWebhookItemOutput,
  normalizeWebhookItemOutput,
  type WebhookItemOutput,
  type BuildWebhookItemParams,
} from './output.js';

/** Webhook trigger plugin — HTTP ingress + pass-through on graph execution. */
export const webhookTriggerPlugin: WorkflowNodePlugin = {
  id: 'trigger:webhook',
  runtimeType: 'trigger',
  kind: 'webhook',
  skipExecution: true,
  trigger: {
    type: WEBHOOK_TRIGGER_TYPE,
    create: async () => {
      throw new Error('Use workflow triggers API to create webhook triggers');
    },
    handle: async (request, trigger, ctx) => {
      const token = trigger.webhookToken;
      if (!token) throw new Error('Webhook trigger missing token');

      const row = await findWebhookTrigger(ctx.db, trigger.ownerId, token);
      if (!row) throw new Error('Webhook not found');

      const input = await parseWebhookInput(request, row as any);
      return { input, trigger: row };
    },
  },
};

/** Core webhook variant — canvas placeholder; execution is pass-through. */
export const coreWebhookPlugin: WorkflowNodePlugin = {
  id: 'core:webhook',
  runtimeType: 'core',
  kind: 'webhook',
  skipExecution: true,
};
