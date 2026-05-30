import type { UserDO } from '../../ws/infrastructure/UserDO.js';

/**
 * Realtime workflow canvas collaboration state stored in the owner's UserDO.
 * Changes are broadcast to all connected WebSocket clients via `workflow_collab`.
 */

export interface WorkflowCollabState {
  workflowId: number;
  definition: string;
  updatedAt: number;
  editorId: string;
  editorName?: string;
}

function storageKey(workflowId: number): string {
  return `workflow_collab:${workflowId}`;
}

export async function getCollabState(
  userDO: DurableObjectStub<UserDO>,
  workflowId: number,
): Promise<WorkflowCollabState | null> {
  const res = await userDO.fetch(
    new Request(`http://user.internal/workflow/collab/get?workflowId=${workflowId}`),
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { state: WorkflowCollabState | null };
  return data.state ?? null;
}

export type PublishCollabInput = Omit<WorkflowCollabState, 'updatedAt'>;

export async function publishCollabState(
  userDO: DurableObjectStub<UserDO>,
  state: PublishCollabInput,
): Promise<WorkflowCollabState> {
  const res = await userDO.fetch(
    new Request('http://user.internal/workflow/collab/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    }),
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? 'Failed to publish collab state');
  }
  const data = (await res.json()) as { state: WorkflowCollabState };
  return data.state;
}
