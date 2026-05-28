"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { useDashboardUser } from "@/app/(main)/dashboard/_context/dashboard-user-context";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { AccountSecurityCard } from "./_components/account-security-card";
import { PayoutSettingsCard } from "./_components/payout-settings-card";
import { ReferralCard } from "./_components/referral-card";
import { SessionsDevicesCard } from "./_components/sessions-devices-card";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

export default function AccountPage() {
  const t = useTranslations("AccountPage");
  const user = useDashboardUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const require2faInUrl = searchParams.get("require2fa") === "1";
  const [resolvedStrongAuthSetup, setResolvedStrongAuthSetup] = useState<boolean | null>(null);
  const effectiveRequiresStrongAuthSetup = resolvedStrongAuthSetup ?? user?.requiresStrongAuthSetup;
  const lockedFor2fa =
    effectiveRequiresStrongAuthSetup === true || require2faInUrl;

  useEffect(() => {
    // Once user has enabled a strong second factor, clear stale require2fa hint.
    if (effectiveRequiresStrongAuthSetup === false && require2faInUrl) {
      router.replace("/dashboard/control/account");
    }
  }, [effectiveRequiresStrongAuthSetup, require2faInUrl, router]);

  useEffect(() => {
    if (!require2faInUrl) {
      setResolvedStrongAuthSetup(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/dashboard/auth/profile/me`, {
          method: "GET",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        if (!res.ok) return;
        const data = (await res.json().catch(() => ({}))) as { requiresStrongAuthSetup?: boolean };
        if (cancelled) return;
        if (typeof data.requiresStrongAuthSetup === "boolean") {
          setResolvedStrongAuthSetup(data.requiresStrongAuthSetup);
        }
      } catch {
        // Keep fallback behavior from context state.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [require2faInUrl]);

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <div>
        <h1 className="mb-1 text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>

      {lockedFor2fa ? (
        <>
          <Alert variant="destructive">
            <AlertTitle>{t("security.require2fa_title")}</AlertTitle>
            <AlertDescription>{t("security.require2fa_description")}</AlertDescription>
          </Alert>
          <AccountSecurityCard />
        </>
      ) : (
        <>
          <ReferralCard />
          <PayoutSettingsCard />
          <AccountSecurityCard />
          <SessionsDevicesCard />
        </>
      )}
    </div>
  );
}
