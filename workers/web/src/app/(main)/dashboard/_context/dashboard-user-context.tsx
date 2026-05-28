"use client";

import * as React from "react";

import { User } from "@/data/users";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

type DashboardUserContextValue = {
  user: User | null;
  refreshUser: () => Promise<void>;
};

const DashboardUserContext = React.createContext<DashboardUserContextValue | null>(null);

async function fetchRequiresStrongAuthSetup(): Promise<boolean | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/dashboard/auth/profile/me`, {
      method: "GET",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as { requiresStrongAuthSetup?: boolean };
    return typeof data.requiresStrongAuthSetup === "boolean" ? data.requiresStrongAuthSetup : null;
  } catch {
    return null;
  }
}

export function DashboardUserProvider({ user: initialUser, children }: { user: User | null; children: React.ReactNode }) {
  const [user, setUser] = React.useState(initialUser);

  React.useEffect(() => {
    setUser(initialUser);
  }, [initialUser]);

  const refreshUser = React.useCallback(async () => {
    const requiresStrongAuthSetup = await fetchRequiresStrongAuthSetup();
    if (requiresStrongAuthSetup === null) return;
    setUser((prev) => (prev ? { ...prev, requiresStrongAuthSetup } : prev));
  }, []);

  const value = React.useMemo(() => ({ user, refreshUser }), [user, refreshUser]);

  return <DashboardUserContext.Provider value={value}>{children}</DashboardUserContext.Provider>;
}

export function useDashboardUser(): User | null {
  return React.useContext(DashboardUserContext)?.user ?? null;
}

export function useRefreshDashboardUser(): () => Promise<void> {
  const ctx = React.useContext(DashboardUserContext);
  return ctx?.refreshUser ?? (async () => {});
}

export { fetchRequiresStrongAuthSetup };
