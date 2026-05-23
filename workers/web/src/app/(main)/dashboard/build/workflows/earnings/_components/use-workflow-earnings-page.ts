"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { getWorkflowEarningsMonthlySummary, type WorkflowEarningsMonthlySummary } from "../../_lib/api";

export function useWorkflowEarningsPage() {
  const t = useTranslations("WorkflowEarningsPage");
  const [summary, setSummary] = useState<WorkflowEarningsMonthlySummary | null>(null);
  const [loading, setLoading] = useState(true);

  const payoutLabels = useMemo(
    () => ({
      pending: t("payout_pending"),
      paid: t("payout_paid"),
      not_scheduled: t("payout_not_scheduled"),
    }),
    [t],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getWorkflowEarningsMonthlySummary();
      setSummary(data);
    } catch {
      toast.error(t("load_error"));
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const closedPeriods = summary?.closedPeriods ?? [];

  const accruingTitle = summary?.currentPeriod
    ? t("accruing_title", { period: summary.currentPeriod })
    : t("accruing_title_fallback");

  return {
    t,
    summary,
    loading,
    closedPeriods,
    payoutLabels,
    accruingTitle,
  };
}
