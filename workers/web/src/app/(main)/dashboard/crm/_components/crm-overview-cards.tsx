"use client";

import { Users, UserPlus, Wallet, BadgeDollarSign, Link2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatCurrency } from "@/lib/utils";

import type { AdminCrmStats } from "../page";

function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

interface CrmOverviewCardsProps {
  stats: AdminCrmStats;
}

export function CrmOverviewCards({ stats }: CrmOverviewCardsProps) {
  const t = useTranslations("CRM");

  const cards = [
    {
      key: "total_users",
      title: t("total_users"),
      desc: t("this_month"),
      value: stats.totalUsers.current.toLocaleString(),
      change: stats.totalUsers.changePercent,
      icon: Users,
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
    },
    {
      key: "referred_users",
      title: t("referred_users"),
      desc: t("this_month"),
      value: stats.referredUsers.current.toLocaleString(),
      change: stats.referredUsers.changePercent,
      icon: Link2,
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-600 dark:text-emerald-400",
    },
    {
      key: "direct_users",
      title: t("direct_users"),
      desc: t("this_month"),
      value: stats.directUsers.current.toLocaleString(),
      change: stats.directUsers.changePercent,
      icon: UserPlus,
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-600 dark:text-blue-400",
    },
    {
      key: "total_revenue",
      title: t("total_revenue"),
      desc: t("this_month"),
      value: formatCurrency(stats.totalRevenue.current, { currency: "VND", noDecimals: true }),
      change: stats.totalRevenue.changePercent,
      icon: Wallet,
      iconBg: "bg-amber-500/10",
      iconColor: "text-amber-600 dark:text-amber-400",
    },
    {
      key: "commission_paid",
      title: t("commission_paid"),
      desc: t("this_month"),
      value: formatCurrency(stats.commissionPaid.current, { currency: "VND", noDecimals: true }),
      change: stats.commissionPaid.changePercent,
      icon: BadgeDollarSign,
      iconBg: "bg-violet-500/10",
      iconColor: "text-violet-600 dark:text-violet-400",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {cards.map((card) => {
        const Icon = card.icon;
        const isPositive = card.change >= 0;
        return (
          <Card key={card.key} className="overflow-hidden shadow-sm transition-shadow hover:shadow-md">
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
