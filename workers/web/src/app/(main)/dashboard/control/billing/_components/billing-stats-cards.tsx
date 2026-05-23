"use client";

import { CreditCard, Receipt, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUsd } from "@/lib/utils";

interface BillingStatsCardsProps {
  /** Wallet balance in USD */
  walletBalanceUsd: number;
  pendingTopUps: number;
  /** Sum of finalAmount (USD) for completed top-up orders on this page */
  completedVolumeUsd: number;
}

export function BillingStatsCards({
  walletBalanceUsd,
  pendingTopUps,
  completedVolumeUsd,
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
          <div className="text-2xl font-bold">{formatUsd(walletBalanceUsd)}</div>
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
