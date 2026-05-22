"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";

import { Landmark, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

export function PayoutBeneficiaryCard() {
  const t = useTranslations("AccountPage.payout_beneficiary");
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  const fetchBeneficiary = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/payout/beneficiary`, {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data: {
          beneficiary?: {
            accountNo?: string;
            accountName?: string;
            bankName?: string;
          } | null;
        } = await res.json();
        if (data.beneficiary?.accountNo) {
          setConfigured(true);
          const bank = data.beneficiary.bankName ?? "";
          const masked = data.beneficiary.accountNo.length > 4
            ? `****${data.beneficiary.accountNo.slice(-4)}`
            : data.beneficiary.accountNo;
          setSummary(`${bank ? `${bank} · ` : ""}${masked} · ${data.beneficiary.accountName ?? ""}`);
        } else {
          setConfigured(false);
          setSummary(null);
        }
      }
    } catch {
      setConfigured(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchBeneficiary();
  }, [fetchBeneficiary]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Landmark className="h-5 w-5" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {loading ? (
          <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
        ) : (
          <>
            {configured ? (
              <Badge variant="secondary">{t("badge_configured")}</Badge>
            ) : (
              <Badge variant="outline">{t("badge_not_configured")}</Badge>
            )}
            {summary && <p className="text-muted-foreground text-sm">{summary}</p>}
          </>
        )}
        <Button variant="outline" size="sm" className="w-fit shrink-0" asChild>
          <Link href="/dashboard/control/account/payout-beneficiary">
            {configured ? t("manage") : t("register")}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
