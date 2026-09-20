"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { formatMoney, formatWhen } from "./format";
import type { OverviewDto } from "./types";

const MIN_DAYS = 5;

export function AlertsBanner({ data }: { data: OverviewDto }) {
  const t = useTranslations("CloudflareUsageAdmin");
  const alerts = (data.alerts ?? data.metrics
    .filter((m) => m.status === "projected_over" && m.exhaustAt)
    .map((m) => {
      const daysAhead = Math.floor((new Date(m.exhaustAt as string).getTime() - Date.now()) / 86_400_000);
      return {
        metricId: m.metricId,
        label: m.label,
        exhaustAt: m.exhaustAt as string,
        daysAhead,
        overageUsdProjected: m.overageUsdProjected,
      };
    })
    .filter((a) => a.daysAhead >= MIN_DAYS)
  ).sort((a, b) => a.daysAhead - b.daysAhead);

  if (!alerts.length) return null;

  return (
    <Alert>
      <AlertTriangle />
      <AlertTitle>{t("alerts_title")}</AlertTitle>
      <AlertDescription>
        <p className="mb-2">{t("alerts_desc")}</p>
        <ul className="list-disc pl-5">
          {alerts.map((a) => (
            <li key={a.metricId}>
              {a.label}: {formatWhen(a.exhaustAt)} ({t("alerts_days", { days: String(a.daysAhead) })}) · {formatMoney(a.overageUsdProjected)}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
