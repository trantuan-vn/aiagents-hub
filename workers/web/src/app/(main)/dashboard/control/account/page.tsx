"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { useDashboardUser } from "@/app/(main)/dashboard/_context/dashboard-user-context";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { AccountSecurityCard } from "./_components/account-security-card";
import { PayoutSettingsCard } from "./_components/payout-settings-card";
import { ReferralCard } from "./_components/referral-card";
import { SessionsDevicesCard } from "./_components/sessions-devices-card";
import { StrongAuthReverify } from "./_components/strong-auth-reverify";

export default function AccountPage() {
  const t = useTranslations("AccountPage");
  const user = useDashboardUser();
  const searchParams = useSearchParams();
  const lockedFor2fa =
    user?.requiresStrongAuthSetup === true || searchParams.get("require2fa") === "1";

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
          <StrongAuthReverify />
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
