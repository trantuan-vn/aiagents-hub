"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

import type { AdminDefaultStats } from "../page";

function formatRevenue(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "VND",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

interface StatCardProps {
  titleKey: string;
  value: string | number;
  changePercent: number;
  footerUpKey: string;
  footerDownKey: string;
  footerMutedKey: string;
  invertBadge?: boolean;
}

function StatCard({
  titleKey,
  value,
  changePercent,
  footerUpKey,
  footerDownKey,
  footerMutedKey,
  invertBadge = false,
}: StatCardProps) {
  const t = useTranslations("Default");
  const isUp = changePercent >= 0;
  const showUp = invertBadge ? !isUp : isUp;
  const Icon = showUp ? TrendingUp : TrendingDown;
  const footerKey = showUp ? footerUpKey : footerDownKey;

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardDescription>{t(titleKey)}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">{value}</CardTitle>
        <CardAction>
          <Badge variant="outline">
            <Icon />
            {formatPercent(changePercent)}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardFooter className="flex-col items-start gap-1.5 text-sm">
        <div className="line-clamp-1 flex gap-2 font-medium">
          {t(footerKey)} <Icon className="size-4" />
        </div>
        <div className="text-muted-foreground">{t(footerMutedKey)}</div>
      </CardFooter>
    </Card>
  );
}

export function SectionCards({ stats }: { stats: AdminDefaultStats }) {
  const { totalRevenue, newCustomers, activeAccounts, apiErrorRate } = stats;

  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      <StatCard
        titleKey="total_revenue"
        value={formatRevenue(totalRevenue.current)}
        changePercent={totalRevenue.changePercent}
        footerUpKey="trending_up_this_month"
        footerDownKey="down_period"
        footerMutedKey="visitors_last_6_months"
      />
      <StatCard
        titleKey="new_customers"
        value={newCustomers.current.toLocaleString()}
        changePercent={newCustomers.changePercent}
        footerUpKey="strong_user_retention"
        footerDownKey="acquisition_needs_attention"
        footerMutedKey="visitors_last_6_months"
      />
      <StatCard
        titleKey="active_accounts"
        value={activeAccounts.current.toLocaleString()}
        changePercent={activeAccounts.changePercent}
        footerUpKey="strong_user_retention"
        footerDownKey="acquisition_needs_attention"
        footerMutedKey="engagement_exceed_targets"
      />
      <StatCard
        titleKey="api_error_rate"
        value={`${apiErrorRate.current.toFixed(2)}%`}
        changePercent={apiErrorRate.changePercent}
        footerUpKey="down_period"
        footerDownKey="steady_performance_increase"
        footerMutedKey="meets_growth_projections"
        invertBadge
      />
    </div>
  );
}
