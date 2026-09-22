/**
 * Durable form/trigger runs: enqueue execution slices on the runner UserDO.
 * Alarm (or immediate waitUntil) advances one slice at a time so Worker
 * form waitUntil never owns the full Save RAG loop.
 */

export const WORKFLOW_CONTINUE_QUEUE_KEY = 'workflow:continueQueue';
export const WORKFLOW_CONTINUE_AT_KEY = 'workflow:continueAt';

/** Wake soon without hitting nextAlarmAfterTick overdue backoff (target <= now). */
export const WORKFLOW_CONTINUE_WAKE_DELAY_MS = 100;

export type WorkflowFormNotify = {
  workflowId: number;
  nodeId: string;
  formPath: string;
  fields: Record<string, unknown>;
  formUrl: string;
  executionMode: 'test' | 'production';
  /** DO id string that should receive the form-result WebSocket broadcast. */
  progressDoId: string;
  bindingName: string;
};

export type WorkflowContinueJob = {
  executionKey: string;
  bindingName: string;
  /** Runner identity (email or DO id) for continueWorkflowExecution. */
  identifier: string;
  runnerDoIdString?: string;
  formNotify?: WorkflowFormNotify;
};

export function earliestContinueWakeAt(jobs: WorkflowContinueJob[], now = Date.now()): number | null {
  if (!jobs.length) return null;
  return now + WORKFLOW_CONTINUE_WAKE_DELAY_MS;
}

/** POST enqueue on the runner Durable Object. */
export async function enqueueWorkflowContinue(
  userDO: DurableObjectStub,
  job: WorkflowContinueJob,
): Promise<void> {
  const res = await userDO.fetch(
    new Request('http://do/workflow/execution/enqueue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(job),
    }),
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`workflow continue enqueue failed: ${res.status} ${text}`.trim());
  }
}
