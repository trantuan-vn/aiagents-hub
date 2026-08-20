import type { UserDO } from '../../../ws/infrastructure/UserDO.js';

export type WorkflowExecutionProgressType = 'started' | 'node_start' | 'node_done' | 'finished';

export type WorkflowExecutionProgressStatus =
  | 'success'
  | 'error'
  | 'skipped'
  | 'pending_human'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface WorkflowExecutionProgressEvent {
  type: WorkflowExecutionProgressType;
  workflowId: number;
  executionKey: string;
  /** Trigger / entry node that started this run. */
  entryNodeId?: string;
  nodeId?: string;
  status?: WorkflowExecutionProgressStatus;
}

/** Push live node progress to the runner's connected WebSocket clients. */
export async function broadcastWorkflowExecutionProgress(
  userDO: DurableObjectStub<UserDO>,
  event: WorkflowExecutionProgressEvent,
): Promise<void> {
  try {
    const res = await userDO.fetch(
      new Request('http://do/workflow/execution/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      }),
    );
    if (!res.ok) {
      console.warn('[execution-progress] broadcast failed', res.status, await res.text().catch(() => ''));
    }
  } catch (e) {
    console.warn('[execution-progress] broadcast error', e instanceof Error ? e.message : String(e));
  }
}
