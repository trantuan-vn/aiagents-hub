"use client";

import {
  BadgeDollarSign,
  Coins,
  PiggyBank,
  Receipt,
  TrendingDown,
  TrendingUp,
  Wallet,
  Waypoints,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { DualValue } from "./dual-value";
import type { DualAmount, UserEconomicsReport } from "./types";

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

type CardSpec = {
  key: string;
  title: string;
  desc: string;
  amount: DualAmount;
  icon: typeof Wallet;
  iconBg: string;
  iconColor: string;
  footnote?: string;
};

export function EconomicsOverviewCards({ data }: { data: UserEconomicsReport }) {
  const t = useTranslations("UserEconomicsAdmin");

  const hubCards: CardSpec[] = [
    {
      key: "hub_revenue",
      title: t("hub_revenue"),
      desc: t("hub_revenue_desc"),
      amount: data.hubRevenue,
      icon: Wallet,
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-600 dark:text-emerald-400",
    },
    {
      key: "cogs",
      title: t("cogs_ai"),
      desc: t("cogs_ai_desc"),
      amount: data.cogsAi,
      icon: TrendingDown,
      iconBg: "bg-amber-500/10",
      iconColor: "text-amber-600 dark:text-amber-400",
    },
    {
      key: "contribution",
      title: t("contribution"),
      desc: t("contribution_desc"),
      amount: data.contribution,
      icon: TrendingUp,
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-600 dark:text-blue-400",
      footnote: t("contribution_pct", { pct: formatPercent(data.contributionPct) }),
    },
    {
      key: "hub_net",
      title: t("hub_net"),
      desc: t("hub_net_desc"),
      amount: data.hubNet,
      icon: PiggyBank,
      iconBg: "bg-violet-500/10",
      iconColor: "text-violet-600 dark:text-violet-400",
    },
  ];

  const userCards: CardSpec[] = [
    {
      key: "user_charged",
      title: t("user_charged"),
      desc: t("user_charged_desc"),
      amount: data.userCharged,
      icon: Receipt,
      iconBg: "bg-cyan-500/10",
      iconColor: "text-cyan-600 dark:text-cyan-400",
    },
    {
      key: "top_up",
      title: t("top_up"),
      desc: t("top_up_desc"),
      amount: data.topUp,
      icon: Coins,
      iconBg: "bg-sky-500/10",
      iconColor: "text-sky-600 dark:text-sky-400",
      footnote: t("orders_count", { count: String(data.orders) }),
    },
    {
      key: "commission_earned",
      title: t("commission_earned"),
      desc: t("commission_earned_desc"),
      amount: data.commissionEarned,
      icon: BadgeDollarSign,
      iconBg: "bg-fuchsia-500/10",
      iconColor: "text-fuchsia-600 dark:text-fuchsia-400",
    },
    {
      key: "royalty_earned",
      title: t("royalty_earned"),
      desc: t("royalty_earned_desc"),
      amount: data.royaltyEarned,
      icon: Waypoints,
      iconBg: "bg-rose-500/10",
      iconColor: "text-rose-600 dark:text-rose-400",
    },
  ];

  const passCards: CardSpec[] = [
    {
      key: "royalty_paid",
      title: t("royalty_paid"),
      desc: t("royalty_paid_desc"),
      amount: data.royaltyPaid,
      icon: Waypoints,
      iconBg: "bg-slate-500/10",
      iconColor: "text-slate-600 dark:text-slate-400",
    },
    {
      key: "commission_paid",
      title: t("commission_paid"),
      desc: t("commission_paid_desc"),
      amount: data.commissionPaid,
      icon: BadgeDollarSign,
      iconBg: "bg-orange-500/10",
      iconColor: "text-orange-600 dark:text-orange-400",
    },
    {
      key: "cogs_infra",
      title: t("cogs_infra"),
      desc: t("cogs_infra_desc"),
      amount: data.cogsInfra,
      icon: TrendingDown,
      iconBg: "bg-stone-500/10",
      iconColor: "text-stone-600 dark:text-stone-400",
    },
    {
      key: "payment_fee",
      title: t("payment_fee"),
      desc: t("payment_fee_desc"),
      amount: data.paymentFee,
      icon: Receipt,
      iconBg: "bg-neutral-500/10",
      iconColor: "text-neutral-600 dark:text-neutral-400",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">{t("hub_section")}</h2>
        <p className="text-muted-foreground text-sm">{t("hub_section_desc")}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{hubCards.map(renderCard)}</div>
      <div className="pt-2">
        <h2 className="text-sm font-semibold tracking-tight">{t("user_section")}</h2>
        <p className="text-muted-foreground text-sm">{t("user_section_desc")}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{userCards.map(renderCard)}</div>
      <div className="pt-2">
        <h2 className="text-sm font-semibold tracking-tight">{t("pass_through")}</h2>
        <p className="text-muted-foreground text-sm">{t("pass_through_desc")}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{passCards.map(renderCard)}</div>
    </div>
  );
}

function renderCard(card: CardSpec) {
  const Icon = card.icon;
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
      <CardContent>
        <DualValue amount={card.amount} />
        {card.footnote ? <p className="text-muted-foreground mt-2 text-xs">{card.footnote}</p> : null}
      </CardContent>
    </Card>
  );
}
