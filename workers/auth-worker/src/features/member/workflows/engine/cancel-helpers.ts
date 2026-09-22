/** Live or paused runs can be stopped from the Executions UI. */
export function isStoppableExecutionStatus(status: string): boolean {
  return status === 'running' || status === 'pending_human';
}

/**
 * A concurrent Stop or stall-to-failed must not be overwritten by a zombie
 * slice that later finishes (or by a hung Worker that finally returns).
 */
export function persistStatusHonoringCancel<T extends string>(
  storedStatus: string | undefined,
  resultStatus: T,
): T | 'cancelled' | 'failed' {
  if (storedStatus === 'cancelled') return 'cancelled';
  if (storedStatus === 'failed' && resultStatus !== 'failed') return 'failed';
  return resultStatus;
}
