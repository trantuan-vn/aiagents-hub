"use client";

import { CreditCard, Receipt, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCredits, formatUsd } from "@/lib/utils";

import type { CreditLotView } from "./billing-api";

interface BillingStatsCardsProps {
  /** Wallet balance in Credits */
  walletBalanceUsd: number;
  pendingTopUps: number;
  /** Sum of finalAmount (USD) for completed top-up orders on this page */
  completedVolumeUsd: number;
  creditsExpiring?: string | null;
  creditLots?: CreditLotView[];
  planId?: "free" | "starter" | "pro" | "business";
  workflowRunsRemaining?: number | null;
}

export function BillingStatsCards({
  walletBalanceUsd,
  pendingTopUps,
  completedVolumeUsd,
  creditsExpiring,
  creditLots = [],
  planId,
  workflowRunsRemaining,
}: BillingStatsCardsProps) {
  const t = useTranslations("BillingPage");

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t("stats.wallet_balance")}</CardTitle>
          <Wallet className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCredits(walletBalanceUsd)}</div>
          {creditLots.length > 0 ? (
            <ul className="text-muted-foreground mt-2 space-y-1 text-xs">
              {creditLots.map((lot, index) => (
                <li key={`${lot.source}-${lot.expiresAt ?? "never"}-${lot.remaining}-${index}`}>
                  {lot.source === "purchased" || !lot.expiresAt
                    ? t("stats.lot_line_never", {
                        amount: formatCredits(lot.remaining),
                        source: t(`stats.lot_${lot.source}`),
                      })
                    : t("stats.lot_line", {
                        amount: formatCredits(lot.remaining),
                        source: t(`stats.lot_${lot.source}`),
                        date: new Date(lot.expiresAt).toLocaleDateString(),
                      })}
                </li>
              ))}
            </ul>
          ) : creditsExpiring ? (
            <p className="text-muted-foreground text-xs">
              {t("stats.expires", { date: new Date(creditsExpiring).toLocaleDateString() })}
            </p>
          ) : planId ? (
            <p className="text-muted-foreground text-xs">{t("stats.plan", { plan: planId })}</p>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t("stats.pending_topups")}</CardTitle>
          <Receipt className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{pendingTopUps}</div>
          <p className="text-muted-foreground text-xs">{t("stats.pending_topups_description")}</p>
          {workflowRunsRemaining != null ? (
            <p className="text-muted-foreground text-xs">{t("stats.runs_remaining", { count: String(workflowRunsRemaining) })}</p>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t("stats.completed_volume")}</CardTitle>
          <CreditCard className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatUsd(completedVolumeUsd)}</div>
          <p className="text-muted-foreground text-xs">{t("stats.completed_volume_description")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
