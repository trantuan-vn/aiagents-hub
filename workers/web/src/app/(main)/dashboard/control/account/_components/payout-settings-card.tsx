"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";

import { Landmark, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

type BeneficiaryPayload = {
  beneficiary?: {
    accountNo?: string;
    accountName?: string;
    bankName?: string;
  } | null;
  paypal?: {
    paypalEmail?: string;
    maskedEmail?: string;
    hasPaypalQr?: boolean;
  } | null;
};

function parseBeneficiaryState(
  data: BeneficiaryPayload,
  currency: "VND" | "USD",
): {
  configured: boolean;
  summary: string | null;
} {
  if (currency === "USD") {
    const email = data.paypal?.maskedEmail ?? data.paypal?.paypalEmail;
    if (!email || !data.paypal?.hasPaypalQr) return { configured: false, summary: null };
    return { configured: true, summary: `PayPal · ${email}` };
  }
  const accountNo = data.beneficiary?.accountNo;
  if (!accountNo) {
    return { configured: false, summary: null };
  }
  const bank = data.beneficiary?.bankName ?? "";
  const masked = accountNo.length > 4 ? `****${accountNo.slice(-4)}` : accountNo;
  const summary = `${bank ? `${bank} · ` : ""}${masked} · ${data.beneficiary?.accountName ?? ""}`;
  return { configured: true, summary };
}

export function PayoutSettingsCard() {
  const t = useTranslations("AccountPage.payout_settings");
  const tBeneficiary = useTranslations("AccountPage.payout_beneficiary");
  const tPreferences = useTranslations("AccountPage.payout_preferences");
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [currency, setCurrency] = useState<"VND" | "USD">("VND");
  const [savingCurrency, setSavingCurrency] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [beneficiaryRes, profileRes] = await Promise.all([
        fetch(`${API_BASE_URL}/dashboard/payout/beneficiary`, {
          method: "GET",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        }),
        fetch(`${API_BASE_URL}/dashboard/auth/profile/me`, { credentials: "include" }),
      ]);

      const profile: { earningsPayoutCurrency?: string } | null = profileRes.ok
        ? await profileRes.json()
        : null;
      const profileCurrency = profile?.earningsPayoutCurrency === "USD" ? "USD" : "VND";

      if (beneficiaryRes.ok) {
        const data: BeneficiaryPayload = await beneficiaryRes.json();
        const { configured: isConfigured, summary: beneficiarySummary } = parseBeneficiaryState(
          data,
          profileCurrency,
        );
        setConfigured(isConfigured);
        setSummary(beneficiarySummary);
      }

      setCurrency(profileCurrency);
    } catch {
      setConfigured(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onCurrencyChange = async (value: "VND" | "USD") => {
    setSavingCurrency(true);
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/auth/profile/payout-preferences`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ earningsPayoutCurrency: value }),
      });
      if (!res.ok) throw new Error(await res.text());
      setCurrency(value);
      void load();
      toast({ title: tPreferences("saved") });
    } catch (e) {
      toast({
        title: tPreferences("error"),
        description: e instanceof Error ? e.message : tPreferences("save_error"),
        variant: "destructive",
      });
    } finally {
      setSavingCurrency(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Landmark className="h-5 w-5" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {loading ? (
          <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
        ) : (
          <>
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium">{tBeneficiary("title")}</p>
              {configured ? (
                <Badge variant="secondary">{tBeneficiary("badge_configured")}</Badge>
              ) : (
                <Badge variant="outline">{tBeneficiary("badge_not_configured")}</Badge>
              )}
              {summary && <p className="text-muted-foreground text-sm">{summary}</p>}
              <Button variant="outline" size="sm" className="w-fit shrink-0" asChild>
                <Link href="/dashboard/control/account/payout-beneficiary">
                  {configured ? tBeneficiary("manage") : tBeneficiary("register")}
                </Link>
              </Button>
            </div>

            <Separator />

            <div className="max-w-sm">
              <Label>{tPreferences("currency_label")}</Label>
              <Select
                value={currency}
                disabled={savingCurrency}
                onValueChange={(v) => void onCurrencyChange(v === "USD" ? "USD" : "VND")}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="VND">{tPreferences("currency_vnd")}</SelectItem>
                  <SelectItem value="USD">{tPreferences("currency_usd")}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-muted-foreground mt-2 text-xs">{tPreferences("hint")}</p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
