"use client";

import { useEffect, useState, type ReactNode } from "react";

import { usePathname, useRouter } from "next/navigation";

import { useDashboardUser } from "@/app/(main)/dashboard/_context/dashboard-user-context";

import { canBypassStepUpOnce, isSensitiveDashboardPath, STEP_UP_SESSION_KEY } from "./sensitive-step-up";

/** Survives Strict Mode remount after the one-shot sessionStorage bypass is consumed. */
let unlockedSensitivePath: string | null = null;

function returnToFor(pathname: string): string {
  if (typeof window !== "undefined" && window.location.pathname === pathname) {
    return `${pathname}${window.location.search}`;
  }
  return pathname;
}

export function SensitiveStepUpRedirect({ children }: { children: ReactNode }) {
  const user = useDashboardUser();
  const pathname = usePathname();
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  // React state (not only the module var) so unlocking after a failed first paint re-renders.
  const [unlockedPath, setUnlockedPath] = useState<string | null>(null);

  useEffect(() => {
    setHydrated(true);
    if (unlockedSensitivePath) {
      setUnlockedPath(unlockedSensitivePath);
    }
  }, []);

  const needsGate =
    Boolean(pathname) &&
    !user?.requiresStrongAuthSetup &&
    isSensitiveDashboardPath(pathname ?? "", user?.role);

  const sessionBypass =
    typeof window !== "undefined" &&
    canBypassStepUpOnce(Date.now(), window.sessionStorage.getItem(STEP_UP_SESSION_KEY), pathname ?? "");
  const allowed =
    !needsGate || unlockedPath === pathname || unlockedSensitivePath === pathname || sessionBypass;

  useEffect(() => {
    if (!pathname) return;
    // Accounts that are forced to setup strong auth must be able to access
    // account security setup screens without being blocked by sensitive step-up.
    if (user?.requiresStrongAuthSetup) {
      unlockedSensitivePath = null;
      setUnlockedPath(null);
      return;
    }
    if (!isSensitiveDashboardPath(pathname, user?.role)) {
      unlockedSensitivePath = null;
      setUnlockedPath(null);
      return;
    }

    const bypass = canBypassStepUpOnce(
      Date.now(),
      window.sessionStorage.getItem(STEP_UP_SESSION_KEY),
      pathname,
    );
    if (unlockedSensitivePath === pathname || bypass) {
      if (bypass) {
        window.sessionStorage.removeItem(STEP_UP_SESSION_KEY);
      }
      unlockedSensitivePath = pathname;
      setUnlockedPath(pathname);
      return;
    }

    router.replace(`/dashboard/step-up?returnTo=${encodeURIComponent(returnToFor(pathname))}`);
  }, [pathname, router, user?.role, user?.requiresStrongAuthSetup]);

  // Do not keep a sticky "unlocked" flag across client navigations: the layout stays
  // mounted, so the previous page's unlocked=true would let sensitive children fetch
  // once before the redirect effect runs.
  if (needsGate && (!hydrated || !allowed)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center" aria-busy="true">
        <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
      </div>
    );
  }
  return children;
}
