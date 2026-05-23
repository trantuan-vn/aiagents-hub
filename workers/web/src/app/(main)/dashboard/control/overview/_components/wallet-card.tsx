"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";

import { Plus, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatUsd } from "@/lib/utils";

import { fetchWalletBalance } from "../../billing/_components/billing-api";

export function WalletCard() {
  const t = useTranslations("OverviewPage");
  const [balanceUsd, setBalanceUsd] = useState<number | null>(null);

  const loadWallet = useCallback(async () => {
    const balance = await fetchWalletBalance();
    setBalanceUsd(balance);
  }, []);

  useEffect(() => {
    void loadWallet();
  }, [loadWallet]);

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
                  {formatUsd(balanceUsd)}
                </p>
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
