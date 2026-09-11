/** Live or paused runs can be stopped from the Executions UI. */
export function isStoppableExecutionStatus(status: string): boolean {
  return status === 'running' || status === 'pending_human';
}

/** A concurrent Stop must not be overwritten by the in-flight engine finishing. */
export function persistStatusHonoringCancel<T extends string>(
  storedStatus: string | undefined,
  resultStatus: T,
): T | 'cancelled' {
  if (storedStatus === 'cancelled') return 'cancelled';
  return resultStatus;
}
