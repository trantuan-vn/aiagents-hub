"use client";

import { Cloud, DollarSign, Hourglass, Layers, TrendingUp, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { daysLeft, formatMoney } from "./format";
import type { OverviewDto } from "./types";

export function OverviewCards({ data }: { data: OverviewDto }) {
  const t = useTranslations("CloudflareUsageAdmin");
  const { plans, summary } = data;
  const zone = plans.zones[0];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-1">
            <Cloud className="h-3.5 w-3.5" />
            {t("plan_workers")}
          </CardDescription>
          <CardTitle className="text-lg">{plans.workers.publicName}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 text-sm">
          <Badge variant="outline">{formatMoney(plans.workers.subscriptionUsdPerMonth)}/mo</Badge>
          {zone ? (
            <Badge variant="secondary">
              {t("plan_zone")}: {zone.publicName}
            </Badge>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-1">
            <Hourglass className="h-3.5 w-3.5" />
            {t("period")}
          </CardDescription>
          <CardTitle className="text-lg">{t("days_left", { days: String(daysLeft(plans.workers.periodEnd)) })}</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          {new Date(plans.workers.periodStart).toISOString().slice(0, 10)} →{" "}
          {new Date(plans.workers.periodEnd).toISOString().slice(0, 10)}
          {plans.workers.periodAssumedUtc ? ` · ${t("period_assumed")}` : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-1">
            <Layers className="h-3.5 w-3.5" />
            {t("included_remaining")}
          </CardDescription>
          <CardTitle className="text-lg">
            {summary.includedRemainingCount}/{summary.trackedMetricCount}
          </CardTitle>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-1">
            <DollarSign className="h-3.5 w-3.5" />
            {t("overage_now")}
          </CardDescription>
          <CardTitle className="text-lg">{formatMoney(summary.totalUsdNow)}</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          {t("flat")}: {formatMoney(summary.flatUsd)} · {t("variable")}: {formatMoney(summary.variableUsdNow)}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-1">
            <TrendingUp className="h-3.5 w-3.5" />
            {t("projected_eom")}
          </CardDescription>
          <CardTitle className="text-lg">{formatMoney(summary.totalUsdProjected)}</CardTitle>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-1">
            <TriangleAlert className="h-3.5 w-3.5" />
            {t("next_exhaust")}
          </CardDescription>
          <CardTitle className="text-lg">
            {summary.noExhaustThisPeriod
              ? t("no_exhaust_this_period")
              : summary.nextExhaust?.label}
          </CardTitle>
        </CardHeader>
        {summary.nextExhaust ? (
          <CardContent className="text-muted-foreground text-sm">
            {new Date(summary.nextExhaust.at).toISOString().replace("T", " ").slice(0, 16)} UTC
          </CardContent>
        ) : null}
      </Card>
    </div>
  );
}
