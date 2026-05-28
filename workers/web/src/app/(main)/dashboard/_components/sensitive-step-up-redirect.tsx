"use client";

import { useEffect } from "react";

import { usePathname, useRouter } from "next/navigation";

import { useDashboardUser } from "@/app/(main)/dashboard/_context/dashboard-user-context";

import { canBypassStepUpOnce, isSensitiveDashboardPath, STEP_UP_SESSION_KEY } from "./sensitive-step-up";

export function SensitiveStepUpRedirect() {
  const user = useDashboardUser();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!pathname) return;
    if (!isSensitiveDashboardPath(pathname, user?.role)) return;
    if (typeof window === "undefined") return;

    const bypass = canBypassStepUpOnce(
      Date.now(),
      window.sessionStorage.getItem(STEP_UP_SESSION_KEY),
      window.location.pathname,
      window.location.search,
    );
    if (bypass) {
      window.sessionStorage.removeItem(STEP_UP_SESSION_KEY);
      return;
    }

    const returnTo = `${window.location.pathname}${window.location.search}`;
    router.replace(`/dashboard/step-up?returnTo=${encodeURIComponent(returnTo)}`);
  }, [pathname, router, user?.role]);

  return null;
}
