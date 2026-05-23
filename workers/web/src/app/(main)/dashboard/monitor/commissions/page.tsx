"use client";

import { TrendingUp } from "lucide-react";

import { CommissionAccruingCard } from "./_components/commission-accruing-card";
import { CommissionClosedPeriodsCard } from "./_components/commission-closed-periods-card";
import { useCommissionsPage } from "./_components/use-commissions-page";

export default function CommissionsPage() {
  const { t, summary, loading, closedPeriods, payoutLabels, accruingTitle } = useCommissionsPage();

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div className="flex items-start gap-3">
        <div className="bg-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
          <TrendingUp className="text-muted-foreground h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t("description")}</p>
        </div>
      </div>

      <CommissionAccruingCard
        summary={summary}
        loading={loading}
        title={accruingTitle}
        accruingStatusLabel={t("accruing_status")}
        description={t("accruing_description")}
        accruingTotalLabel={t("accruing_total")}
        noItemsLabel={t("no_accruing_items")}
        tableTitle={t("accruing_table_title")}
        timeLabel={t("time")}
        referredUserLabel={t("referred_user")}
        orderValueLabel={t("order_value")}
        commissionPercentLabel={t("commission_percent")}
        commissionAmountLabel={t("commission_amount")}
      />

      <CommissionClosedPeriodsCard
        summary={summary}
        closedPeriods={closedPeriods}
        loading={loading}
        title={t("closed_title")}
        description={t("closed_description")}
        loadingLabel={t("loading")}
        noItemsLabel={t("no_closed_items")}
        closedTotalLabel={t("closed_total")}
        periodLabel={t("period")}
        amountLabel={t("amount")}
        payoutStatusLabel={t("payout_status")}
        payoutLabels={payoutLabels}
      />
    </div>
  );
}
