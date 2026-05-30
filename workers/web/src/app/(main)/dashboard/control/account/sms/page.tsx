"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";
import { redirect } from "next/navigation";

import { ArrowLeft, MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SMS_2FA_ENABLED } from "@/lib/feature-flags";
import { useRefreshDashboardUser } from "@/app/(main)/dashboard/_context/dashboard-user-context";
import { useToast } from "@/hooks/use-toast";

import { type SmsStep, renderSmsStepContent } from "./_components/sms-step-content";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

export default function SmsPage() {
  // SMS 2FA tạm ẩn cho đến khi mua dịch vụ gửi SMS (xem SMS_2FA_ENABLED).
  if (!SMS_2FA_ENABLED) redirect("/dashboard/control/account");

  const t = useTranslations("AccountPage.sms");
  const { toast } = useToast();
  const refreshUser = useRefreshDashboardUser();
  const [step, setStep] = useState<SmsStep>("idle");
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/auth/sms/status`, {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data: { enabled?: boolean } = await res.json();
        setEnabled(Boolean(data.enabled));
      } else {
        setEnabled(false);
      }
    } catch {
      setEnabled(false);
      toast({ title: t("error_fetch"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [t, toast]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const onRequest = async () => {
    const normalized = phone.replace(/\s/g, "").trim();
    if (!normalized) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/auth/sms/request`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalized }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? t("error_request"));
      }
      setStep("verify");
      setCode("");
      toast({ title: t("code_sent") });
    } catch (e) {
      toast({
        title: t("error_request"),
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const onVerify = async () => {
    if (code.length !== 6) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/auth/sms/verify`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? t("error_verify"));
      }
      setStep("success");
      setCode("");
      void refreshUser();
      void fetchStatus();
    } catch (e) {
      toast({
        title: t("error_verify"),
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const onDisable = async () => {
    if (disableCode.length !== 6) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/auth/sms/disable`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: disableCode }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? t("error_disable"));
      }
      toast({ title: t("disable_success") });
      setStep("idle");
      setDisableCode("");
      void refreshUser();
      void fetchStatus();
    } catch (e) {
      toast({
        title: t("error_disable"),
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <Button variant="ghost" size="sm" className="w-fit" asChild>
          <Link href="/dashboard/control/account">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("back_to_account")}
          </Link>
        </Button>
        <p className="text-muted-foreground text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" size="sm" className="w-fit" asChild>
        <Link href="/dashboard/control/account">
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t("back_to_account")}
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            {t("title")}
          </CardTitle>
          <CardDescription>{t("subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {renderSmsStepContent(
            step,
            enabled,
            phone,
            code,
            disableCode,
            submitting,
            t,
            setPhone,
            setCode,
            setDisableCode,
            onRequest,
            onVerify,
            onDisable,
          )}
        </CardContent>
      </Card>
    </div>
  );
}
