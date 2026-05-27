type AdminEnv = Pick<Env, 'ADMIN_IDENTIFIERS' | 'ENVIRONMENT'> &
  Partial<Pick<Env, 'PRIMARY_ADMIN_IDENTIFIER'>>;

/** Comma-separated admin emails from env (lowercased). Production requires ADMIN_IDENTIFIERS. */
export function getAdminIdentifiers(env: AdminEnv): string[] {
  const raw = env.ADMIN_IDENTIFIERS?.trim();
  if (!raw) {
    if (env.ENVIRONMENT === 'production') {
      console.error('[admin-config] ADMIN_IDENTIFIERS is not set in production');
    }
    return [];
  }
  return raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function isAdminIdentifier(env: AdminEnv, identifier: string): boolean {
  const normalized = identifier.trim().toLowerCase();
  return getAdminIdentifiers(env).includes(normalized);
}

/** User DO id for system-wide records (payouts, exchange rates, commission policies). */
export function getPrimaryAdminIdentifier(env: AdminEnv): string {
  const primary = env.PRIMARY_ADMIN_IDENTIFIER?.trim();
  if (primary) return primary.toLowerCase();
  const admins = getAdminIdentifiers(env);
  if (admins.length === 0) {
    throw new Error('No admin identifier configured (set PRIMARY_ADMIN_IDENTIFIER or ADMIN_IDENTIFIERS)');
  }
  return admins[0];
}
