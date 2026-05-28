"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";

import { ArrowLeft, KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useRefreshDashboardUser } from "@/app/(main)/dashboard/_context/dashboard-user-context";
import { useToast } from "@/hooks/use-toast";

import { type AuthenticatorStep, renderStepContent } from "./_components/authenticator-step-content";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

export default function AuthenticatorPage() {
  const t = useTranslations("AccountPage.authenticator");
  const { toast } = useToast();
  const refreshUser = useRefreshDashboardUser();
  const [step, setStep] = useState<AuthenticatorStep>("idle");
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupData, setSetupData] = useState<{ secret: string; qrCodeUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/auth/authenticator/status`, {
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

  const startSetup = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/auth/authenticator/setup`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? t("error_setup"));
      }
      const data: { secret?: string; qrCodeUrl?: string } = await res.json();
      setSetupData({ secret: data.secret ?? "", qrCodeUrl: data.qrCodeUrl ?? "" });
      setStep("setup");
      setCode("");
    } catch (e) {
      toast({
        title: t("error_setup"),
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const submitVerify = async () => {
    if (code.length !== 6) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/auth/authenticator/verify`, {
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

  const submitDisable = async () => {
    if (disableCode.length !== 6) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/auth/authenticator/disable`, {
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

  const copySecret = () => {
    if (!setupData?.secret) return;
    void navigator.clipboard.writeText(setupData.secret).then(() => {
      toast({ title: "Secret copied" });
    });
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
            <KeyRound className="h-5 w-5" />
            {t("title")}
          </CardTitle>
          <CardDescription>{t("subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {renderStepContent(
            step,
            enabled,
            setupData,
            code,
            disableCode,
            submitting,
            t,
            setCode,
            setDisableCode,
            startSetup,
            submitVerify,
            submitDisable,
            copySecret,
          )}
        </CardContent>
      </Card>
    </div>
  );
}
