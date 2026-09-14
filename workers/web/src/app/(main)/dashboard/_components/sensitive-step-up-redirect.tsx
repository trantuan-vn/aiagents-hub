"use client";

import { useEffect, useState, type ReactNode } from "react";

import { usePathname, useRouter } from "next/navigation";

import { useDashboardUser } from "@/app/(main)/dashboard/_context/dashboard-user-context";

import { canBypassStepUpOnce, isSensitiveDashboardPath, STEP_UP_SESSION_KEY } from "./sensitive-step-up";

/** Survives Strict Mode remount after the one-shot sessionStorage bypass is consumed. */
let unlockedSensitivePath: string | null = null;

function clientPath(): string {
  return `${window.location.pathname}${window.location.search}`;
}

export function SensitiveStepUpRedirect({ children }: { children: ReactNode }) {
  const user = useDashboardUser();
  const pathname = usePathname();
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const needsGate =
    Boolean(pathname) &&
    !user?.requiresStrongAuthSetup &&
    isSensitiveDashboardPath(pathname ?? "", user?.role);

  const currentPath = typeof window !== "undefined" ? clientPath() : (pathname ?? "");
  const sessionBypass =
    typeof window !== "undefined" &&
    canBypassStepUpOnce(
      Date.now(),
      window.sessionStorage.getItem(STEP_UP_SESSION_KEY),
      window.location.pathname,
      window.location.search,
    );
  const allowed = !needsGate || unlockedSensitivePath === currentPath || sessionBypass;

  useEffect(() => {
    if (!pathname) return;
    // Accounts that are forced to setup strong auth must be able to access
    // account security setup screens without being blocked by sensitive step-up.
    if (user?.requiresStrongAuthSetup) {
      unlockedSensitivePath = null;
      return;
    }
    if (!isSensitiveDashboardPath(pathname, user?.role)) {
      unlockedSensitivePath = null;
      return;
    }

    const path = clientPath();
    const bypass = canBypassStepUpOnce(
      Date.now(),
      window.sessionStorage.getItem(STEP_UP_SESSION_KEY),
      window.location.pathname,
      window.location.search,
    );
    if (unlockedSensitivePath === path || bypass) {
      if (bypass) {
        window.sessionStorage.removeItem(STEP_UP_SESSION_KEY);
      }
      unlockedSensitivePath = path;
      return;
    }

    router.replace(`/dashboard/step-up?returnTo=${encodeURIComponent(path)}`);
  }, [pathname, router, user?.role, user?.requiresStrongAuthSetup]);

  // Do not keep a sticky "unlocked" flag across client navigations: the layout stays
  // mounted, so the previous page's unlocked=true would let sensitive children fetch
  // once before the redirect effect runs.
  if (needsGate && (!hydrated || !allowed)) return null;
  return children;
}
