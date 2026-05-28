"use client";

import { useEffect } from "react";

import { usePathname, useRouter } from "next/navigation";

import {
  fetchRequiresStrongAuthSetup,
  useDashboardUser,
  useRefreshDashboardUser,
} from "@/app/(main)/dashboard/_context/dashboard-user-context";

const ACCOUNT_PATH = "/dashboard/control/account";
const STEP_UP_PATH = "/dashboard/step-up";

/** Đưa user có số dư chưa 2FA về trang bảo mật tài khoản. */
export function StrongAuthSetupRedirect() {
  const user = useDashboardUser();
  const refreshUser = useRefreshDashboardUser();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!user?.requiresStrongAuthSetup) return;
    if (!pathname) return;
    if (pathname === STEP_UP_PATH || pathname.startsWith(`${STEP_UP_PATH}/`)) return;
    if (pathname === ACCOUNT_PATH || pathname.startsWith(`${ACCOUNT_PATH}/`)) return;

    let cancelled = false;
    void (async () => {
      const requiresSetup = await fetchRequiresStrongAuthSetup();
      if (cancelled) return;
      if (requiresSetup === false) {
        await refreshUser();
        return;
      }
      if (requiresSetup === true || (requiresSetup === null && user.requiresStrongAuthSetup)) {
        router.replace(`${ACCOUNT_PATH}?require2fa=1`);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.requiresStrongAuthSetup, pathname, router, refreshUser]);

  return null;
}
