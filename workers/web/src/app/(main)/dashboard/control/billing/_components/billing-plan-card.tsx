"use client";

import { useState } from "react";

import { Package } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { formatUsd } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

import { API_BASE_URL, planRenewalUsd } from "./billing-api";

export type BillingPlanId = "free" | "starter" | "pro" | "business";

export function BillingPlanCard({
  planId,
  planStatus,
  planCurrentPeriodEnd,
  cancelAtPeriodEnd,
  billingEnabled,
  planSource,
  planInterval,
  paypalSubscriptionId,
  onChanged,
}: {
  planId: BillingPlanId;
  planStatus?: string | null;
  planCurrentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  billingEnabled?: boolean;
  planSource?: string | null;
  planInterval?: number | null;
  paypalSubscriptionId?: string | null;
  onChanged?: () => void;
}) {
  const t = useTranslations("BillingPage");
  const { toast } = useToast();
  const paid = planId !== "free";
  const interval = planInterval === 3 || planInterval === 6 || planInterval === 12 ? planInterval : 1;
  const hasSubscribe =
    paid && planSource === "paypal" && planStatus !== "approval_pending" && Boolean(paypalSubscriptionId);
  const periodLabel = planCurrentPeriodEnd ? new Date(planCurrentPeriodEnd).toLocaleDateString() : "";
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");

  const postSub = async (path: "cancel" | "resume") => {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/billing/subscriptions/${path}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: path === "cancel" ? JSON.stringify({ reason }) : "{}",
      });
      if (!res.ok) throw new Error(t("cancel_error"));
      toast({ title: path === "cancel" ? t("cancel_scheduled") : t("resume_ok") });
      setOpen(false);
      onChanged?.();
    } catch (e) {
      toast({
        title: t("error"),
        description: e instanceof Error ? e.message : t("cancel_error"),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const startSubscribe = async () => {
    if (planId === "free") return;
    setBusy(true);
    try {
      const startTime =
        planCurrentPeriodEnd && Date.parse(planCurrentPeriodEnd) - Date.now() >= 24 * 60 * 60 * 1000
          ? new Date(planCurrentPeriodEnd).toISOString()
          : undefined;
      const res = await fetch(`${API_BASE_URL}/dashboard/billing/subscriptions/checkout`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, interval, method: "subscription", ...(startTime ? { startTime } : {}) }),
      });
      const json = (await res.json()) as { approvalUrl?: string; error?: string };
      if (!res.ok || !json.approvalUrl) throw new Error(json.error ?? t("subscribe_error"));
      window.location.href = json.approvalUrl;
    } catch (e) {
      toast({
        title: t("error"),
        description: e instanceof Error ? e.message : t("subscribe_error"),
        variant: "destructive",
      });
      setBusy(false);
    }
  };

  return (
    <>
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
              <button
                type="button"
                className="text-primary text-xs underline-offset-4 hover:underline"
                onClick={() => setOpen(true)}
              >
                {cancelAtPeriodEnd || !hasSubscribe
                  ? t("ends_on", { date: periodLabel })
                  : t("renews_on", { date: periodLabel })}
                {" · "}
                {t("view_next_period")}
              </button>
            ) : null}
            {!billingEnabled ? <p className="text-muted-foreground text-xs">{t("billing_coming")}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <a href="/packages">{t("upgrade_plan")}</a>
            </Button>
            {paid ? (
              <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
                {t("cancel_plan")}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("next_period_title")}</DialogTitle>
            <DialogDescription>
              {hasSubscribe ? t("next_period_subscribe_hint") : t("next_period_prepaid_hint")}
            </DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">{t("next_period_plan")}</dt>
            <dd className="capitalize">{planId}</dd>
            <dt className="text-muted-foreground">{t("next_period_interval")}</dt>
            <dd>{t("next_period_interval_value", { n: String(interval) })}</dd>
            {paid ? (
              <>
                <dt className="text-muted-foreground">{t("next_period_amount")}</dt>
                <dd>{formatUsd(planRenewalUsd(planId, interval))}</dd>
              </>
            ) : null}
            {planCurrentPeriodEnd ? (
              <>
                <dt className="text-muted-foreground">
                  {hasSubscribe && !cancelAtPeriodEnd ? t("next_period_charge_on") : t("next_period_access_until")}
                </dt>
                <dd>{periodLabel}</dd>
              </>
            ) : null}
          </dl>
          {paid && hasSubscribe && !cancelAtPeriodEnd ? (
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("cancel_reason")} />
          ) : null}
          <DialogFooter className="gap-2 sm:justify-between">
            {paid && hasSubscribe && cancelAtPeriodEnd ? (
              <Button disabled={busy} onClick={() => void postSub("resume")}>
                {t("resume_plan")}
              </Button>
            ) : null}
            {paid && hasSubscribe && !cancelAtPeriodEnd ? (
              <Button variant="destructive" disabled={busy} onClick={() => void postSub("cancel")}>
                {t("cancel_subscribe")}
              </Button>
            ) : null}
            {paid && !hasSubscribe ? (
              <Button disabled={busy || !billingEnabled} onClick={() => void startSubscribe()}>
                {t("enable_subscribe")}
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t("keep_plan")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
