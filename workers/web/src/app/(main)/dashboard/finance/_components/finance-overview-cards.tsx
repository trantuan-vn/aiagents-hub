"use client";

import { Wallet, ShoppingCart, CheckCircle2, BadgeDollarSign, Tag, TrendingUp, BarChart3 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatUsd } from "@/lib/utils";

import type { AdminFinanceStats } from "../page";

function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

interface FinanceOverviewCardsProps {
  stats: AdminFinanceStats;
}

export function FinanceOverviewCards({ stats }: FinanceOverviewCardsProps) {
  const t = useTranslations("FinanceAdmin");

  const cards = [
    {
      key: "total_revenue",
      title: t("total_revenue"),
      desc: t("this_month"),
      value: formatUsd(stats.totalRevenue.current),
      change: stats.totalRevenue.changePercent,
      icon: Wallet,
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-600 dark:text-emerald-400",
    },
    {
      key: "net_revenue",
      title: t("net_revenue"),
      desc: t("this_month"),
      value: formatUsd(stats.netRevenue.current),
      change: stats.netRevenue.changePercent,
      icon: TrendingUp,
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-600 dark:text-blue-400",
    },
    {
      key: "total_orders",
      title: t("total_orders"),
      desc: t("this_month"),
      value: stats.totalOrders.current.toLocaleString(),
      change: stats.totalOrders.changePercent,
      icon: ShoppingCart,
      iconBg: "bg-amber-500/10",
      iconColor: "text-amber-600 dark:text-amber-400",
    },
    {
      key: "completed_orders",
      title: t("completed_orders"),
      desc: t("this_month"),
      value: stats.completedOrders.current.toLocaleString(),
      change: stats.completedOrders.changePercent,
      icon: CheckCircle2,
      iconBg: "bg-green-500/10",
      iconColor: "text-green-600 dark:text-green-400",
    },
    {
      key: "commission_paid",
      title: t("commission_paid"),
      desc: t("this_month"),
      value: formatUsd(stats.commissionPaid.current),
      change: stats.commissionPaid.changePercent,
      icon: BadgeDollarSign,
      iconBg: "bg-violet-500/10",
      iconColor: "text-violet-600 dark:text-violet-400",
    },
    {
      key: "total_discounts",
      title: t("total_discounts"),
      desc: t("this_month"),
      value: formatUsd(stats.totalDiscounts.current),
      change: stats.totalDiscounts.changePercent,
      icon: Tag,
      iconBg: "bg-rose-500/10",
      iconColor: "text-rose-600 dark:text-rose-400",
    },
    {
      key: "average_order_value",
      title: t("average_order_value"),
      desc: t("this_month"),
      value: formatUsd(stats.averageOrderValue.current),
      change: stats.averageOrderValue.changePercent,
      icon: BarChart3,
      iconBg: "bg-cyan-500/10",
      iconColor: "text-cyan-600 dark:text-cyan-400",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
      {cards.map((card) => {
        const Icon = card.icon;
        const isPositive = card.change >= 0;
        return (
          <Card
            key={card.key}
            className="hover:border-primary/20 overflow-hidden shadow-sm transition-all duration-200 hover:shadow-md"
          >
            <CardHeader className="pb-2">
              <div className={cn("flex size-10 items-center justify-center rounded-lg", card.iconBg)}>
                <Icon className={cn("size-5", card.iconColor)} />
              </div>
              <CardTitle className="text-base font-medium">{card.title}</CardTitle>
              <CardDescription>{card.desc}</CardDescription>
            </CardHeader>
            <CardContent className="pb-2">
              <p className="text-2xl font-bold tabular-nums">{card.value}</p>
              <div
                className={cn(
                  "mt-2 inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
                  isPositive
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-red-500/10 text-red-600 dark:text-red-400",
                )}
              >
                {formatPercent(card.change)}
              </div>
            </CardContent>
            <CardFooter className="text-muted-foreground pt-0 text-xs">
              {isPositive ? t("vs_previous_month_up") : t("vs_previous_month_down")}
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}
