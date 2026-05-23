"use client";

import { Wallet } from "lucide-react";

import { useWorkflowEarningsPage } from "./_components/use-workflow-earnings-page";
import { WorkflowAccruingCard } from "./_components/workflow-accruing-card";
import { WorkflowClosedPeriodsCard } from "./_components/workflow-closed-periods-card";

export default function WorkflowEarningsPage() {
  const { t, summary, loading, closedPeriods, payoutLabels, accruingTitle } = useWorkflowEarningsPage();

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div className="flex items-start gap-3">
        <div className="bg-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
          <Wallet className="text-muted-foreground h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t("description")}</p>
        </div>
      </div>

      <WorkflowAccruingCard
        summary={summary}
        loading={loading}
        title={accruingTitle}
        accruingStatusLabel={t("accruing_status")}
        description={t("accruing_description")}
        accruingTotalLabel={t("accruing_total")}
        noItemsLabel={t("no_accruing_items")}
        tableTitle={t("accruing_table_title")}
        workflowLabel={t("workflow")}
        amountLabel={t("amount")}
        dateLabel={t("date")}
      />

      <WorkflowClosedPeriodsCard
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
