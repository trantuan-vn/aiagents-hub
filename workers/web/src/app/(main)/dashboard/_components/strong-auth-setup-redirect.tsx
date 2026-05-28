"use client";

import { useEffect } from "react";

import { usePathname, useRouter } from "next/navigation";

import { useDashboardUser } from "@/app/(main)/dashboard/_context/dashboard-user-context";

const ACCOUNT_PATH = "/dashboard/control/account";

/** Đưa user có số dư chưa 2FA về trang bảo mật tài khoản. */
export function StrongAuthSetupRedirect() {
  const user = useDashboardUser();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!user?.requiresStrongAuthSetup) return;
    if (pathname === ACCOUNT_PATH || pathname.startsWith(`${ACCOUNT_PATH}/`)) return;
    router.replace(`${ACCOUNT_PATH}?require2fa=1`);
  }, [user?.requiresStrongAuthSetup, pathname, router]);

  return null;
}
