import { createLogger } from '../../../../shared/logger.js';
import { executeUtils } from '../../../../shared/utils.js';
import { UserDO } from '../../../ws/infrastructure/UserDO.js';
import { sweepExpiredWalletPatch } from './credit-wallet.js';

const log = createLogger('auth-worker', 'credit-lots');

const PAGE = 50;
const MAX_PAGES = 40;

export async function expireCreditLotsForUserDO(
  userDO: DurableObjectStub<UserDO>,
  now = new Date(),
): Promise<boolean> {
  const users = await executeUtils.executeDynamicAction(userDO, 'select', {}, 'users');
  const u = Array.isArray(users) ? users[0] : users;
  if (!u?.id) return false;
  const row = u as Record<string, unknown>;
  const patch = sweepExpiredWalletPatch(row, now);
  if (!patch) return false;
  await executeUtils.executeDynamicAction(
    userDO,
    'update',
    { id: row.id, ...row, ...patch, queueStatus: 'pending' },
    'users',
  );
  return true;
}

/** Persist remaining=0 (dropped) for each expired credit lot on UserDO, then flush via queue. */
export async function expireCreditLotsForAllUsers(
  env: Env,
  now = new Date(),
): Promise<{ scanned: number; updated: number }> {
  const db = env.D1DB;
  const ns = env.USER_DO;
  if (!db || !ns) return { scanned: 0, updated: 0 };
  let scanned = 0;
  let updated = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    let rows: Array<{ identifier?: string }> = [];
    try {
      const result = await db
        .prepare(
          `SELECT DISTINCT identifier FROM users WHERE creditLotsJson IS NOT NULL AND length(creditLotsJson) > 2 LIMIT ? OFFSET ?`,
        )
        .bind(PAGE, page * PAGE)
        .all<{ identifier?: string }>();
      rows = result.results ?? [];
    } catch (err) {
      log.warn('credit_lots.expire_query_failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return { scanned, updated };
    }
    if (!rows.length) break;
    for (const row of rows) {
      const identifier = String(row.identifier ?? '').trim();
      if (!identifier) continue;
      scanned += 1;
      try {
        const userDO = ns.get(ns.idFromName(identifier)) as DurableObjectStub<UserDO>;
        if (await expireCreditLotsForUserDO(userDO, now)) updated += 1;
      } catch (err) {
        log.warn('credit_lots.expire_user_failed', {
          identifier,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    if (rows.length < PAGE) break;
  }
  log.info('credit_lots.expire_scan', { scanned, updated });
  return { scanned, updated };
}
