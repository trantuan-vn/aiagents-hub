"use client";

import { useEffect, useState } from "react";

import { Cloud } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { isStepUpRequired, parseDashboardApiError } from "@/lib/dashboard-api-error";
import { formatUsd } from "@/lib/utils";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

type CogsSummary = {
  totalUsdProjected: number;
  totalUsdNow: number;
  costSource: string;
};

export function FinanceCloudflareCogsCard() {
  const t = useTranslations("FinanceAdmin");
  const [cogs, setCogs] = useState<CogsSummary | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/dashboard/admin/cloudflare/overview`, {
          method: "GET",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        if (!response.ok) {
          const errBody = await parseDashboardApiError(response);
          if (isStepUpRequired(errBody)) return;
          if (!cancelled) setUnavailable(true);
          return;
        }
        const data = (await response.json()) as {
          summary?: { totalUsdProjected?: number; totalUsdNow?: number };
          costSource?: string;
        };
        if (cancelled) return;
        setCogs({
          totalUsdProjected: Number(data.summary?.totalUsdProjected ?? 0),
          totalUsdNow: Number(data.summary?.totalUsdNow ?? 0),
          costSource: data.costSource ?? "catalog_estimate",
        });
      } catch {
        if (!cancelled) setUnavailable(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Link href="/dashboard/cloudflare-usage" className="block">
      <Card className="hover:border-primary/20 overflow-hidden shadow-sm transition-all duration-200 hover:shadow-md">
        <CardHeader className="pb-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-sky-500/10">
            <Cloud className="size-5 text-sky-600 dark:text-sky-400" />
          </div>
          <CardTitle className="text-base font-medium">{t("cloudflare_cogs")}</CardTitle>
          <CardDescription>{t("cloudflare_cogs_desc")}</CardDescription>
        </CardHeader>
        <CardContent className="pb-2">
          <p className="text-2xl font-bold tabular-nums">
            {unavailable || !cogs ? t("cloudflare_cogs_unavailable") : formatUsd(cogs.totalUsdProjected)}
          </p>
        </CardContent>
        <CardFooter className="text-muted-foreground pt-0 text-xs">
          {cogs && !unavailable
            ? `${t("cloudflare_cogs_now")}: ${formatUsd(cogs.totalUsdNow)} · ${cogs.costSource}`
            : t("cloudflare_cogs_link")}
        </CardFooter>
      </Card>
    </Link>
  );
}
