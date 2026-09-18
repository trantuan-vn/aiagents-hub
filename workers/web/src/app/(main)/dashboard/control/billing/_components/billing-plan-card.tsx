"use client";

import Link from "next/link";

import { Package } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type BillingPlanId = "free" | "starter" | "pro" | "business";

export function BillingPlanCard({
  planId,
  planStatus,
  planCurrentPeriodEnd,
  cancelAtPeriodEnd,
  billingEnabled,
}: {
  planId: BillingPlanId;
  planStatus?: string | null;
  planCurrentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  billingEnabled?: boolean;
}) {
  const t = useTranslations("BillingPage");
  const paid = planId !== "free";
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{t("workspace_plan")}</CardTitle>
        <Package className="text-muted-foreground h-4 w-4" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-2xl font-bold capitalize">{planId}</p>
          {planStatus ? <p className="text-muted-foreground text-xs">{t("plan_status", { status: planStatus })}</p> : null}
          {planCurrentPeriodEnd ? (
            <p className="text-muted-foreground text-xs">
              {cancelAtPeriodEnd
                ? t("ends_on", { date: new Date(planCurrentPeriodEnd).toLocaleDateString() })
                : t("renews_on", { date: new Date(planCurrentPeriodEnd).toLocaleDateString() })}
            </p>
          ) : null}
          {!billingEnabled ? <p className="text-muted-foreground text-xs">{t("billing_coming")}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <a href="/packages">{t("upgrade_plan")}</a>
          </Button>
          {paid ? (
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/control/billing/cancel">{t("cancel_plan")}</Link>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
