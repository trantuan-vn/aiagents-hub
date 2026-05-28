"use client";

import { useState, useEffect, useCallback } from "react";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { useToast } from "@/hooks/use-toast";
import { dashboardApiErrorMessage, parseDashboardApiError } from "@/lib/dashboard-api-error";

import { ActivityCard } from "./_components/activity-card";
import { ApiKeysCard } from "./_components/api-keys-card";
import { QuickLinksCard } from "./_components/quick-links-card";
import { ReferralSummary } from "./_components/referral-summary";
import { StatsCards } from "./_components/stats-cards";
import { SubscriptionsCard } from "./_components/subscriptions-card";
import { TrustHighlights } from "./_components/trust-highlights";
import { WalletCard } from "./_components/wallet-card";
import { WelcomeHero } from "./_components/welcome-hero";
import { WorkflowIncomeSummary } from "./_components/workflow-income-summary";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

interface OverviewStats {
  totalApiCalls: number;
  activeSubscriptions: number;
  activeTokens: number;
}

interface OverviewSubscription {
  id: number;
  name: string;
  endpoint?: string;
  plan?: string;
  calls: number;
  limit: number;
  nextBilling?: string | null;
}

interface OverviewApiKey {
  id: number;
  name: string;
  status: "active" | "inactive";
  lastUsed?: string | null;
  expiresAt?: string | null;
  createdAt: string;
}

interface OverviewActivity {
  action: string;
  endpoint: string;
  status: "success" | "error" | "info";
  time: string;
}

interface OverviewData {
  stats: OverviewStats;
  subscriptions: OverviewSubscription[];
  apiKeys: OverviewApiKey[];
  recentActivity: OverviewActivity[];
}

const ACCOUNT_REQUIRE_2FA_PATH = "/dashboard/control/account?require2fa=1";

export default function OverviewPage() {
  const t = useTranslations("OverviewPage");
  const router = useRouter();
  const { toast } = useToast();
  const [data, setData] = useState<OverviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/dashboard/overview`, {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const errBody = await parseDashboardApiError(response);
        if (errBody?.requiresStrongAuthSetup) {
          router.replace(ACCOUNT_REQUIRE_2FA_PATH);
          return;
        }
        throw new Error(dashboardApiErrorMessage(errBody, t("fetch_error")));
      }

      const result: OverviewData = await response.json();
      setData(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t("fetch_error");
      setError(errorMessage);
      toast({
        title: t("fetch_error"),
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [t, toast, router]);

  useEffect(() => {
    void fetchOverview();
  }, [fetchOverview]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 md:gap-6">
        <div className="mb-8">
          <h1 className="mb-1 text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("loading")}</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col gap-4 md:gap-6">
        <div className="mb-8">
          <h1 className="mb-1 text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{error ?? t("fetch_error")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <div>
        <div>
          <h1 className="mb-1 text-2xl font-bold tracking-tight md:text-3xl">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>
      </div>

      <WelcomeHero t={t} />

      <WalletCard />

      <StatsCards stats={data.stats} t={t} />

      <TrustHighlights t={t} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SubscriptionsCard subscriptions={data.subscriptions} t={t} />
          <ApiKeysCard apiKeys={data.apiKeys} t={t} />
        </div>
        <div className="space-y-6">
          <ActivityCard activities={data.recentActivity} t={t} />
          <ReferralSummary t={t} />
          <WorkflowIncomeSummary t={t} />
          <QuickLinksCard t={t} />
        </div>
      </div>
    </div>
  );
}
