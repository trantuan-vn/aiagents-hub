"use client";

import { useEffect, useState } from "react";

import { ChevronRight, Package } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { fetchWalletSnapshot, type WalletSnapshot } from "../../billing/_components/billing-api";

interface Subscription {
  id: number;
  name: string;
  plan?: string;
  calls: number;
  limit: number;
  nextBilling?: string | null;
}

interface SubscriptionsCardProps {
  subscriptions: Subscription[];
}

export function SubscriptionsCard({ subscriptions }: SubscriptionsCardProps) {
  const t = useTranslations("OverviewPage");
  const [snap, setSnap] = useState<WalletSnapshot | null>(null);

  useEffect(() => {
    void fetchWalletSnapshot().then(setSnap);
  }, []);

  const planId = snap?.planId ?? "free";
  const paid = planId !== "free";
  const period = snap?.planCurrentPeriodEnd
    ? new Date(snap.planCurrentPeriodEnd).toLocaleDateString()
    : null;

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden transition-shadow hover:shadow-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="text-primary h-5 w-5" />
                {t("workspace_plan.title")}
              </CardTitle>
              <CardDescription>{t("workspace_plan.description")}</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              {/* eslint-disable @next/next/no-html-link-for-pages -- Full page load: client-side nav to React Router causes white screen */}
              <a href="/packages" className="gap-1">
                {t("workspace_plan.upgrade")}
                <ChevronRight className="h-4 w-4" />
              </a>
              {/* eslint-enable @next/next/no-html-link-for-pages */}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-2xl font-bold capitalize">{planId}</p>
            {snap?.planStatus ? (
              <p className="text-muted-foreground text-sm">{t("workspace_plan.status", { status: snap.planStatus })}</p>
            ) : null}
            {period ? (
              <p className="text-muted-foreground text-sm">
                {snap?.cancelAtPeriodEnd
                  ? t("workspace_plan.ends_on", { date: period })
                  : t("workspace_plan.renews_on", { date: period })}
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">{t("workspace_plan.free_hint")}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <a href="/packages">{paid ? t("workspace_plan.change") : t("workspace_plan.upgrade")}</a>
            </Button>
            {paid ? (
              <Button asChild size="sm" variant="outline">
                <a href="/dashboard/control/billing/cancel">{t("workspace_plan.cancel")}</a>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {subscriptions.length > 0 ? (
        <Card className="overflow-hidden transition-shadow hover:shadow-md">
          <CardHeader>
            <CardTitle>{t("subscriptions.title")}</CardTitle>
            <CardDescription>{t("subscriptions.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {subscriptions.map((sub) => (
              <div key={sub.id} className="group bg-muted/30 hover:bg-muted/50 rounded-xl border p-4 transition-all">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <h4 className="font-semibold">{sub.name}</h4>
                  {sub.plan ? (
                    <Badge variant="secondary" className="shrink-0">
                      {sub.plan}
                    </Badge>
                  ) : null}
                </div>
                <p className="text-muted-foreground text-sm tabular-nums">
                  {t("subscriptions.usage_count", { count: String(sub.calls.toLocaleString()) })}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
