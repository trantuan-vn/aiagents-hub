import type { Context } from 'hono';
import { UserDO } from '../../ws/infrastructure/UserDO';
import { getPrimaryAdminIdentifier } from '../admin-identifier';
import { DEFAULT_USD_VND_RATE } from './domain';
import { createExchangeRateInfrastructure } from './infrastructure';

export function todayDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function resolveEnv(c: Context | Env): Env {
  return typeof (c as Context).env !== 'undefined' ? (c as Context).env : (c as Env);
}

function adminExchangeRateStub(env: Env, bindingName: string): DurableObjectStub<UserDO> {
  const binding = env[bindingName as keyof Env] as DurableObjectNamespace;
  if (!binding) {
    throw new Error(`Durable Object binding '${bindingName}' not found`);
  }
  return binding.get(binding.idFromName(getPrimaryAdminIdentifier(env))) as DurableObjectStub<UserDO>;
}

/** VND per 1 USD for a calendar day (exact match, else latest on/before, else default). */
export async function getUsdVndRateForDate(
  c: Context | Env,
  bindingName: string,
  rateDate: string = todayDateString(),
): Promise<number> {
  const env = resolveEnv(c);
  const infra = createExchangeRateInfrastructure(adminExchangeRateStub(env, bindingName));
  const exact = await infra.getByDate(rateDate);
  if (exact && exact.usdVndRate >= 1) return exact.usdVndRate;
  const latest = await infra.getLatestOnOrBefore(rateDate);
  if (latest && latest.usdVndRate >= 1) return latest.usdVndRate;
  return DEFAULT_USD_VND_RATE;
}

export async function getUsdVndRateFromEnv(
  env: Env,
  bindingName: string = 'USER_DO',
): Promise<number> {
  return getUsdVndRateForDate(env, bindingName, todayDateString());
}
