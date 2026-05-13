export interface DailyUsage {
  date: string;
  requestCount: number;
  successCount: number;
  errorCount: number;
  cost: number;
}

export interface AnalyticsData {
  daily: DailyUsage[];
  totalRequests: number;
  totalCost: number;
  duration: string;
}

export function formatDate(dateStr: string, locale?: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(locale ?? "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Định dạng chi phí thực tế (giá cố định hoặc cost từ AI Gateway). */
export function formatUsageCost(amount: number): string {
  if (amount == null || amount === 0) return "—";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 8 }).format(amount);
}

export function getQualityLevel(
  successRate: number,
  t: (k: string) => string,
): { label: string; color: string; bgClass: string; badgeClass: string } {
  if (successRate >= 99.5)
    return {
      label: t("stats.quality_excellent"),
      color: "text-emerald-600 dark:text-emerald-400",
      bgClass: "from-emerald-500/15 to-emerald-600/5",
      badgeClass: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    };
  if (successRate >= 95)
    return {
      label: t("stats.quality_good"),
      color: "text-amber-600 dark:text-amber-400",
      bgClass: "from-amber-500/15 to-amber-600/5",
      badgeClass: "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30",
    };
  return {
    label: t("stats.quality_attention"),
    color: "text-rose-600 dark:text-rose-400",
    bgClass: "from-rose-500/15 to-rose-600/5",
    badgeClass: "bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/30",
  };
}
