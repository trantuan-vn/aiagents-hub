"use client";

import Link from "next/link";

import { AlertTriangle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatEnterpriseDate, type EnterpriseStatus } from "@/lib/enterprise-api";

type Props = {
  status: EnterpriseStatus;
  periodEnd: string | null;
  seatGraceUntil: string | null;
  showBillingLink?: boolean;
};

/** Grace window (§2.4) or suspension notice; renders nothing for a healthy organization. */
export function EnterpriseGraceBanner({ status, periodEnd, seatGraceUntil, showBillingLink }: Props) {
  const t = useTranslations("Enterprise.banner");
  const locale = useLocale();

  if (status === "suspended") {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>{t("suspended_title")}</AlertTitle>
        <AlertDescription>{t("suspended_body")}</AlertDescription>
      </Alert>
    );
  }
  if (status !== "active" || !seatGraceUntil) return null;
  return (
    <Alert className="border-amber-500/50 text-amber-700 dark:text-amber-400">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{t("grace_title")}</AlertTitle>
      <AlertDescription>
        {t("grace_body", {
          periodEnd: formatEnterpriseDate(periodEnd, locale),
          graceUntil: formatEnterpriseDate(seatGraceUntil, locale),
        })}
        {showBillingLink ? (
          <>
            {" "}
            <Link href="/dashboard/control/billing" className="font-medium underline">
              {t("billing_link")}
            </Link>
          </>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
