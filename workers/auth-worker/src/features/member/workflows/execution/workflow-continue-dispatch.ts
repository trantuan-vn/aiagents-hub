import { continueWorkflowExecution } from '../engine/executor.js';
import { broadcastFormSubmissionResult } from '../triggers/form-submission.js';
import {
  WORKFLOW_CONTINUE_AT_KEY,
  WORKFLOW_CONTINUE_QUEUE_KEY,
  WORKFLOW_CONTINUE_WAKE_DELAY_MS,
  type WorkflowContinueJob,
} from './workflow-continue.js';

type ContinueStorage = {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean | void>;
  setAlarm?(time: number): Promise<void>;
  getAlarm?(): Promise<number | null>;
};

export async function readContinueQueue(storage: ContinueStorage): Promise<WorkflowContinueJob[]> {
  const raw = await storage.get<WorkflowContinueJob[]>(WORKFLOW_CONTINUE_QUEUE_KEY);
  return Array.isArray(raw) ? raw : [];
}

export async function writeContinueQueue(
  storage: ContinueStorage,
  jobs: WorkflowContinueJob[],
): Promise<void> {
  if (!jobs.length) {
    await storage.delete(WORKFLOW_CONTINUE_QUEUE_KEY);
    await storage.delete(WORKFLOW_CONTINUE_AT_KEY);
    return;
  }
  await storage.put(WORKFLOW_CONTINUE_QUEUE_KEY, jobs);
  await storage.put(WORKFLOW_CONTINUE_AT_KEY, Date.now() + WORKFLOW_CONTINUE_WAKE_DELAY_MS);
}

export async function workflowContinueWakeAt(storage: ContinueStorage): Promise<number | null> {
  const jobs = await readContinueQueue(storage);
  if (!jobs.length) {
    await storage.delete(WORKFLOW_CONTINUE_AT_KEY);
    return null;
  }
  const cached = await storage.get<number>(WORKFLOW_CONTINUE_AT_KEY);
  if (typeof cached === 'number' && Number.isFinite(cached)) return cached;
  const wake = Date.now() + WORKFLOW_CONTINUE_WAKE_DELAY_MS;
  await storage.put(WORKFLOW_CONTINUE_AT_KEY, wake);
  return wake;
}

async function notifyFormIfNeeded(
  env: Env,
  job: WorkflowContinueJob,
  status: string,
): Promise<void> {
  const notify = job.formNotify;
  if (!notify) return;
  await broadcastFormSubmissionResult(env, notify.bindingName, notify.progressDoId, {
    workflowId: notify.workflowId,
    nodeId: notify.nodeId,
    formPath: notify.formPath,
    executionKey: job.executionKey,
    status,
    fields: notify.fields,
    formUrl: notify.formUrl,
    executionMode: notify.executionMode,
  });
}

/**
 * Run one continue job. Returns whether more work remains for this execution
 * (caller should keep the job queued) and whether the queue still has jobs.
 */
export async function dispatchOneWorkflowContinue(params: {
  env: Env;
  storage: ContinueStorage;
  /** This DO's id string — used as runnerDoIdString. */
  runnerDoIdString: string;
  /** Billing/user identifier for the runner. */
  identifier: string;
}): Promise<{ hadWork: boolean; stillQueued: boolean }> {
  const jobs = await readContinueQueue(params.storage);
  const job = jobs[0];
  if (!job) {
    await writeContinueQueue(params.storage, []);
    return { hadWork: false, stillQueued: false };
  }

  const rest = jobs.slice(1);
  // Drop from queue while running so a concurrent alarm cannot double-run.
  await writeContinueQueue(params.storage, rest);

  let resultStatus = 'failed';
  try {
    const result = await continueWorkflowExecution({
      c: { env: params.env } as any,
      bindingName: job.bindingName,
      user: { identifier: job.identifier || params.identifier },
      executionKey: job.executionKey,
      runnerDoIdString: job.runnerDoIdString ?? params.runnerDoIdString,
    });
    resultStatus = result.status;
    if (result.status === 'running') {
      // More slices needed — put job back at front.
      const next = await readContinueQueue(params.storage);
      await writeContinueQueue(params.storage, [job, ...next]);
      return { hadWork: true, stillQueued: true };
    }
    if (
      result.status === 'completed' ||
      result.status === 'failed' ||
      result.status === 'cancelled' ||
      result.status === 'pending_human'
    ) {
      await notifyFormIfNeeded(params.env, job, result.status);
    }
  } catch (e) {
    console.error(
      '[workflow-continue] dispatch failed',
      job.executionKey,
      e instanceof Error ? e.message : String(e),
    );
    try {
      await notifyFormIfNeeded(params.env, job, 'failed');
    } catch {
      /* ignore */
    }
  }

  const remaining = await readContinueQueue(params.storage);
  return { hadWork: true, stillQueued: remaining.length > 0 };
}

export async function enqueueContinueJob(
  storage: ContinueStorage,
  job: WorkflowContinueJob,
  armAlarm: (when: number) => Promise<void>,
): Promise<void> {
  const jobs = await readContinueQueue(storage);
  // Dedupe same executionKey — keep the newest formNotify.
  const filtered = jobs.filter((j) => j.executionKey !== job.executionKey);
  filtered.push(job);
  await writeContinueQueue(storage, filtered);
  await armAlarm(Date.now() + WORKFLOW_CONTINUE_WAKE_DELAY_MS);
}
