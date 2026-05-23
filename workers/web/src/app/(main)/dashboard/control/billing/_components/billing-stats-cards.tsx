"use client";

import { CreditCard, Receipt, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

interface BillingStatsCardsProps {
  /** Wallet balance in USD */
  walletBalanceUsd: number;
  pendingTopUps: number;
  /** Sum of finalAmount (VND) for completed top-up orders on this page */
  completedVolumeVnd: number;
  /** VND per 1 USD (daily exchange rate) */
  usdVndRate: number;
}

export function BillingStatsCards({
  walletBalanceUsd,
  pendingTopUps,
  completedVolumeVnd,
  usdVndRate,
}: BillingStatsCardsProps) {
  const t = useTranslations("BillingPage");

  const fmtVnd = (n: number): string =>
    new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(n);

  const envRate = Number(process.env.NEXT_PUBLIC_USD_VND_RATE ?? "26000");
  const rate = usdVndRate > 0 ? usdVndRate : envRate > 0 ? envRate : 26000;
  const approxVnd = walletBalanceUsd * rate;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t("stats.wallet_balance")}</CardTitle>
          <Wallet className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {formatCurrency(walletBalanceUsd, { currency: "USD", maximumFractionDigits: 4 })}
          </div>
          <p className="text-muted-foreground text-xs">
            {t("stats.wallet_balance_vnd_hint", { amount: fmtVnd(approxVnd) })}
          </p>
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
          <div className="text-2xl font-bold">{fmtVnd(completedVolumeVnd)}</div>
          <p className="text-muted-foreground text-xs">{t("stats.completed_volume_description")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
