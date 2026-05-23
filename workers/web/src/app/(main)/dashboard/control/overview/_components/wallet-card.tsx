"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";

import { Plus, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

import {
  FALLBACK_USD_VND,
  fetchMemberBillingParams,
  fetchWalletBalance,
} from "../../billing/_components/billing-api";

export function WalletCard() {
  const t = useTranslations("OverviewPage");
  const [balanceUsd, setBalanceUsd] = useState<number | null>(null);
  const [usdVndRate, setUsdVndRate] = useState(FALLBACK_USD_VND);

  const loadWallet = useCallback(async () => {
    const [balance, params] = await Promise.all([fetchWalletBalance(), fetchMemberBillingParams()]);
    setBalanceUsd(balance);
    setUsdVndRate(params.usdVndRate);
  }, []);

  useEffect(() => {
    void loadWallet();
  }, [loadWallet]);

  const rate = usdVndRate > 0 ? usdVndRate : FALLBACK_USD_VND;
  const approxVnd =
    balanceUsd != null
      ? new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(balanceUsd * rate)
      : null;

  return (
    <Card className="border-primary/20 from-primary/5 bg-gradient-to-br to-background">
      <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="bg-primary/10 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl">
            <Wallet className="text-primary h-6 w-6" />
          </div>
          <div className="min-w-0">
            <p className="text-muted-foreground text-sm font-medium">{t("wallet.title")}</p>
            {balanceUsd == null ? (
              <div className="bg-muted mt-2 h-8 w-36 animate-pulse rounded-md" />
            ) : (
              <>
                <p className="text-primary mt-0.5 text-2xl font-bold tracking-tight tabular-nums md:text-3xl">
                  {formatCurrency(balanceUsd, { currency: "USD", maximumFractionDigits: 4 })}
                </p>
                {approxVnd != null ? (
                  <p className="text-muted-foreground mt-0.5 text-xs">{t("wallet.vnd_hint", { amount: approxVnd })}</p>
                ) : null}
              </>
            )}
          </div>
        </div>
        <Button asChild size="sm" className="shrink-0 gap-1.5 self-start sm:self-center">
          <Link href="/dashboard/control/billing?topup=1">
            <Plus className="h-4 w-4" />
            {t("wallet.top_up")}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
