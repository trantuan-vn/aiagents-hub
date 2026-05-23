"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { getCommissionMonthlySummary, type CommissionMonthlySummary } from "../_lib/api";

export function useCommissionsPage() {
  const t = useTranslations("CommissionsPage");
  const [summary, setSummary] = useState<CommissionMonthlySummary | null>(null);
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
      const data = await getCommissionMonthlySummary();
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
