import type { UserDO } from '../../ws/infrastructure/UserDO.js';

/** Ask this owner's UserDO to recompute its multiplexed alarm (cron + WS/queue). */
export async function touchUserCronAlarm(env: Env, ownerId: string): Promise<void> {
  if (!env.USER_DO || !ownerId) return;
  const stub = env.USER_DO.get(env.USER_DO.idFromString(ownerId)) as DurableObjectStub<UserDO>;
  await stub.touchCronSchedule();
}
