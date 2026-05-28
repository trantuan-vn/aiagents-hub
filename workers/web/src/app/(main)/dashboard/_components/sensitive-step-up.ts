export const STEP_UP_SESSION_KEY = "dashboard_sensitive_step_up_allow_once";
export const STEP_UP_ONCE_TTL_MS = 2 * 60 * 1000;

const ACCOUNT_SECURITY_PREFIXES = [
  "/dashboard/control/token",
  "/dashboard/control/account/authenticator",
  "/dashboard/control/account/passkey",
  "/dashboard/control/account/sms",
  "/dashboard/control/account/backup-codes",
  "/dashboard/control/account/payout-beneficiary",
  "/dashboard/notify",
  "/dashboard/control/notifications",
] as const;

const ADMIN_MANAGEMENT_PREFIXES = [
  "/dashboard/service",
  "/dashboard/voucher",
  "/dashboard/version",
  "/dashboard/system-config",
  "/dashboard/exchange-rates",
  "/dashboard/commission-policy",
  "/dashboard/default",
  "/dashboard/crm",
  "/dashboard/finance",
  "/dashboard/earnings-payouts",
  "/dashboard/policy",
  "/dashboard/user-groups",
] as const;

export function isSensitiveDashboardPath(pathname: string, role?: "member" | "admin"): boolean {
  if (pathname.startsWith("/dashboard/step-up")) return false;

  if (ACCOUNT_SECURITY_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return true;
  }

  if (role === "admin" && ADMIN_MANAGEMENT_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return true;
  }

  return false;
}

export function canBypassStepUpOnce(
  now: number,
  payloadRaw: string | null,
  pathname: string,
  search: string,
): boolean {
  if (!payloadRaw) return false;
  try {
    const payload = JSON.parse(payloadRaw) as { path?: string; at?: number };
    if (!payload?.path || typeof payload.at !== "number") return false;
    if (now - payload.at >= STEP_UP_ONCE_TTL_MS) return false;
    const currentPath = `${pathname}${search}`;
    return payload.path === currentPath;
  } catch {
    return false;
  }
}
