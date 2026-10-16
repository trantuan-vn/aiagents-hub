"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";

import { Copy, Gift } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

interface ReferralSummaryProps {
  t: (key: string) => string;
}

interface ReferralData {
  referralLink?: string;
  referralCode?: string;
}

export function ReferralSummary({ t }: ReferralSummaryProps) {
  const { toast } = useToast();
  const [referral, setReferral] = useState<ReferralData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const linkRes = await fetch(`${API_BASE_URL}/dashboard/referral/link`, {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      if (linkRes.ok) {
        const linkData: ReferralData = await linkRes.json();
        setReferral(linkData);
      }
    } catch {
      setReferral(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleCopy = () => {
    if (referral?.referralLink) {
      void navigator.clipboard.writeText(referral.referralLink);
      toast({ title: t("referral.copied") });
    }
  };

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardHeader>
          <div className="bg-muted h-5 w-32 rounded" />
          <div className="bg-muted mt-2 h-4 w-48 rounded" />
        </CardHeader>
        <CardContent>
          <div className="bg-muted h-16 rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  const hasReferral = Boolean(referral?.referralLink);

  return (
    <Card className="border-primary/20 overflow-hidden transition-shadow hover:shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gift className="text-primary h-5 w-5" />
          {t("referral.title")}
        </CardTitle>
        <CardDescription>{t("referral.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasReferral ? (
          <>
            <div className="bg-primary/5 rounded-lg p-3">
              <p className="text-muted-foreground text-xs">{t("referral.reward_hint")}</p>
              <p className="text-primary text-2xl font-bold">{t("referral.reward")}</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleCopy} className="w-full gap-1.5">
              <Copy className="h-4 w-4" />
              {t("referral.copy_link")}
            </Button>
          </>
        ) : (
          <Button variant="outline" size="sm" asChild className="w-full">
            <Link href="/dashboard/control/account" className="gap-2">
              <Gift className="h-4 w-4" />
              {t("referral.setup")}
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
