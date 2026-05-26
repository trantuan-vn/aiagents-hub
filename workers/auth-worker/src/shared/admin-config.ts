const FALLBACK_PRIMARY_ADMIN = 'tuanta2021@gmail.com';

/** Comma-separated admin emails from env (lowercased). */
export function getAdminIdentifiers(env: Pick<Env, 'ADMIN_IDENTIFIERS'>): string[] {
  const raw = env.ADMIN_IDENTIFIERS?.trim();
  if (!raw) return [FALLBACK_PRIMARY_ADMIN];
  const ids = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return ids.length > 0 ? ids : [FALLBACK_PRIMARY_ADMIN];
}

export function isAdminIdentifier(
  env: Pick<Env, 'ADMIN_IDENTIFIERS'>,
  identifier: string,
): boolean {
  const normalized = identifier.trim().toLowerCase();
  return getAdminIdentifiers(env).includes(normalized);
}

/** User DO id for system-wide records (payouts, exchange rates, commission policies). */
export function getPrimaryAdminIdentifier(
  env: Pick<Env, 'PRIMARY_ADMIN_IDENTIFIER' | 'ADMIN_IDENTIFIERS'>,
): string {
  const primary = env.PRIMARY_ADMIN_IDENTIFIER?.trim();
  if (primary) return primary.toLowerCase();
  return getAdminIdentifiers(env)[0] ?? FALLBACK_PRIMARY_ADMIN;
}
