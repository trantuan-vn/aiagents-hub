import { UserDO } from '../../ws/infrastructure/UserDO';
import { executeUtils } from '../../../shared/utils';
import {
  currentPeriodYm,
  downgradeOneTier,
  getDefaultTierConfigs,
  minVndToRetainTier,
  tierFromMonthlyTopUpVnd,
  upgradeTierIfHigher,
  type MembershipTier,
  type MembershipTierConfig,
} from './domain';
import { getTierConfigsFromEnv } from './get-tier-configs';

type DbUser = Record<string, unknown>;

function readTier(user: DbUser): MembershipTier {
  const t = user.membershipTier ?? user.membership_tier;
  if (t === 'silver' || t === 'gold' || t === 'diamond') return t;
  return 'member';
}

function readPeriod(user: DbUser): string {
  const p = user.tierPeriodYm ?? user.tier_period_ym;
  return typeof p === 'string' && /^\d{4}-\d{2}$/.test(p) ? p : currentPeriodYm();
}

function readMonthlyTopUp(user: DbUser): number {
  const v = user.monthlyTopUpVnd ?? user.monthly_top_up_vnd;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** At month boundary: downgrade one tier if previous month did not meet retention threshold. */
export function applyMonthlyTierDowngrade(
  user: DbUser,
  configs: MembershipTierConfig[],
): { tier: MembershipTier; periodYm: string; monthlyTopUpVnd: number } {
  const nowYm = currentPeriodYm();
  let tier = readTier(user);
  let periodYm = readPeriod(user);
  let monthlyTopUpVnd = readMonthlyTopUp(user);

  if (periodYm !== nowYm) {
    const prevTotal = monthlyTopUpVnd;
    const required = minVndToRetainTier(tier, configs);
    if (tier !== 'member' && prevTotal < required) {
      tier = downgradeOneTier(tier);
    }
    periodYm = nowYm;
    monthlyTopUpVnd = 0;
  }

  return { tier, periodYm, monthlyTopUpVnd };
}

export async function syncUserMembershipTierOnAccess(
  userDO: DurableObjectStub<UserDO>,
  env?: { SYSTEM_CONFIG_KV?: KVNamespace },
): Promise<DbUser | null> {
  const configs = env ? await getTierConfigsFromEnv(env) : getDefaultTierConfigs();
  const rows = await executeUtils.executeDynamicAction(userDO, 'select', {}, 'users');
  const dbUser = rows[0] as DbUser | undefined;
  if (!dbUser?.id) return null;

  const { tier, periodYm, monthlyTopUpVnd } = applyMonthlyTierDowngrade(dbUser, configs);
  const storedTier = readTier(dbUser);
  const storedPeriod = readPeriod(dbUser);
  const storedMonthly = readMonthlyTopUp(dbUser);

  if (tier !== storedTier || periodYm !== storedPeriod || monthlyTopUpVnd !== storedMonthly) {
    await executeUtils.executeDynamicAction(
      userDO,
      'update',
      {
        id: dbUser.id,
        membershipTier: tier,
        tierPeriodYm: periodYm,
        monthlyTopUpVnd,
        queueStatus: 'pending',
      },
      'users',
    );
    return { ...dbUser, membershipTier: tier, tierPeriodYm: periodYm, monthlyTopUpVnd };
  }

  return dbUser;
}

/** After a completed top-up: add VND to monthly total and upgrade tier if eligible. */
export async function recordTopUpAndUpgradeTier(
  userDO: DurableObjectStub<UserDO>,
  topUpVnd: number,
  env?: { SYSTEM_CONFIG_KV?: KVNamespace },
): Promise<MembershipTier> {
  const configs = env ? await getTierConfigsFromEnv(env) : getDefaultTierConfigs();
  const synced = await syncUserMembershipTierOnAccess(userDO, env);
  const dbUser = synced ?? (await executeUtils.executeDynamicAction(userDO, 'select', {}, 'users'))[0];
  if (!dbUser?.id) return 'member';

  const add = Math.max(0, Math.round(topUpVnd));
  let { tier, periodYm, monthlyTopUpVnd } = applyMonthlyTierDowngrade(dbUser as DbUser, configs);
  monthlyTopUpVnd += add;

  const tierFromAmount = tierFromMonthlyTopUpVnd(monthlyTopUpVnd, configs);
  tier = upgradeTierIfHigher(tier, tierFromAmount);

  await executeUtils.executeDynamicAction(
    userDO,
    'update',
    {
      id: dbUser.id,
      membershipTier: tier,
      tierPeriodYm: periodYm,
      monthlyTopUpVnd,
      queueStatus: 'pending',
    },
    'users',
  );

  return tier;
}
