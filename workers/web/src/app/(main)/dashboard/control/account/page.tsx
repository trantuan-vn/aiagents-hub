"use client";

import { useTranslations } from "next-intl";

import { AccountSecurityCard } from "./_components/account-security-card";
import { DidCard } from "./_components/did-card";
import { EkycCard } from "./_components/ekyc-card";
import { SessionsDevicesCard } from "./_components/sessions-devices-card";

export default function AccountPage() {
  const t = useTranslations("AccountPage");

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <div>
        <h1 className="mb-1 text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>

      <AccountSecurityCard />
      <SessionsDevicesCard />
      <EkycCard />
      <DidCard />
    </div>
  );
}
