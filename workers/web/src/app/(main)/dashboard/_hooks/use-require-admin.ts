"use client";

import { useEffect } from "react";

import { useRouter } from "next/navigation";

import { useDashboardUser } from "../_context/dashboard-user-context";

const MEMBER_REDIRECT_PATH = "/dashboard/control/overview";

/** Redirects non-admin users away from admin-only pages. Returns true when the user is an admin. */
export function useRequireAdmin(): boolean {
  const user = useDashboardUser();
  const router = useRouter();
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (user && !isAdmin) {
      router.replace(MEMBER_REDIRECT_PATH);
    }
  }, [user, isAdmin, router]);

  return isAdmin;
}
