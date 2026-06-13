import type { UserDO } from '../../ws/infrastructure/UserDO.js';

export interface WorkflowWebhookEvent {
  workflowId: number;
  nodeId: string | null;
  webhookPath: string | null;
  executionKey: string;
  status: string;
  input: string;
  output?: unknown;
  receivedAt: number;
  method: string;
}

/** Push webhook execution result to the workflow owner's connected WebSocket clients. */
export async function broadcastWorkflowWebhookResult(
  env: Env,
  bindingName: string,
  ownerId: string,
  event: WorkflowWebhookEvent,
): Promise<void> {
  try {
    const binding = (env as unknown as Record<string, unknown>)[bindingName] as DurableObjectNamespace;
    const ownerDO = binding.get(binding.idFromString(ownerId)) as DurableObjectStub<UserDO>;
    const res = await ownerDO.fetch(
      new Request('http://do/workflow/webhook/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      }),
    );
    if (!res.ok) {
      console.warn('[webhook-notify] broadcast failed', res.status, await res.text().catch(() => ''));
    }
  } catch (e) {
    console.warn('[webhook-notify] broadcast error', e instanceof Error ? e.message : String(e));
  }
}
