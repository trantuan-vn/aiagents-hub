"use client";

import { useEffect, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

import { API_BASE_URL, formatPaypalCancelAt, paypalCancelAtFromPeriodEnd } from "../_components/billing-api";

type Me = {
  planId?: string;
  planStatus?: string | null;
  planCurrentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
};

export default function CancelPlanPage() {
  const t = useTranslations("BillingPage");
  const locale = useLocale();
  const { toast } = useToast();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch(`${API_BASE_URL}/dashboard/billing/subscriptions/me`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => setMe(json as Me))
      .catch(() => setMe(null));
  }, []);

  const end = me?.planCurrentPeriodEnd ? new Date(me.planCurrentPeriodEnd).toLocaleDateString() : "—";
  const paypalCancelAt = paypalCancelAtFromPeriodEnd(me?.planCurrentPeriodEnd);
  const paypalCancelLabel =
    paypalCancelAt && paypalCancelAt.getTime() > Date.now() ? formatPaypalCancelAt(paypalCancelAt, locale) : "";
  const paypalCancelNote =
    me?.planStatus === "canceled"
      ? t("paypal_cancel_already")
      : paypalCancelLabel
        ? t("paypal_cancel_scheduled_note", { date: paypalCancelLabel })
        : t("paypal_cancel_soon");

  const post = async (path: "cancel" | "resume") => {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/billing/subscriptions/${path}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: path === "cancel" ? JSON.stringify({ reason }) : "{}",
      });
      if (!res.ok) throw new Error(t("cancel_error"));
      toast({
        title: path === "cancel" ? t("cancel_scheduled") : t("resume_ok"),
        description: path === "cancel" ? paypalCancelNote : undefined,
      });
      router.push("/dashboard/control/billing");
    } catch (e) {
      toast({ title: t("error"), description: e instanceof Error ? e.message : t("cancel_error"), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("cancel_title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">{t("cancel_body", { plan: me?.planId ?? "free", date: end })}</p>
          <p className="text-muted-foreground text-sm">
            {paypalCancelLabel ? t("paypal_cancel_if_confirm", { date: paypalCancelLabel }) : t("paypal_cancel_soon")}
          </p>
          <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
            <li>{t("cancel_lose_credits")}</li>
            <li>{t("cancel_lose_share")}</li>
            <li>{t("cancel_lose_hooks")}</li>
          </ul>
          {me?.cancelAtPeriodEnd ? (
            <>
              <p className="text-muted-foreground text-sm">{t("cancel_scheduled")}</p>
              <p className="text-muted-foreground text-sm">{paypalCancelNote}</p>
              {me.planStatus !== "canceled" ? (
                <Button disabled={busy} onClick={() => void post("resume")}>
                  {t("resume_plan")}
                </Button>
              ) : null}
            </>
          ) : (
            <>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("cancel_reason")} />
              <div className="flex gap-2">
                <Button variant="destructive" disabled={busy || me?.planId === "free"} onClick={() => void post("cancel")}>
                  {t("confirm_cancel")}
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/dashboard/control/billing">{t("keep_plan")}</Link>
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
