"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";

import { Copy, ExternalLink, Gift } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

export function ReferralCard() {
  const t = useTranslations("AccountPage.referral");
  const { toast } = useToast();
  const [referralLink, setReferralLink] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  const fetchReferralLink = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/referral/link`, {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data: { referralLink?: string; referralCode?: string } = await res.json();
        setReferralLink(data.referralLink ?? "");
      }
    } catch {
      setReferralLink("");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchReferralLink();
  }, [fetchReferralLink]);

  const handleCopy = () => {
    if (referralLink) {
      void navigator.clipboard.writeText(referralLink);
      toast({ title: t("copied"), description: t("copied_description") });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gift className="h-5 w-5" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-muted-foreground text-sm">{t("loading")}</p>
        ) : (
          <>
            <div className="space-y-2">
              <label className="text-muted-foreground text-sm font-medium">{t("link_label")}</label>
              <div className="flex gap-2">
                <Input readOnly value={referralLink} className="font-mono text-sm" />
                <Button variant="outline" size="icon" onClick={handleCopy} disabled={!referralLink}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="default" size="sm" asChild>
                <Link href="/dashboard/monitor/commissions">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {t("manage_commission")}
                </Link>
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
