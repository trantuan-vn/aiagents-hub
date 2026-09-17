"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";

import { RefreshCw, Search, Users } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dashboardApiErrorMessage, isStepUpRequired, parseDashboardApiError } from "@/lib/dashboard-api-error";
import { formatCredits, formatUsd } from "@/lib/utils";

import { useRequireAdmin } from "../_hooks/use-require-admin";
import { EconomicsCharts } from "./_components/economics-charts";
import { EconomicsOverviewCards } from "./_components/economics-overview-cards";
import { EconomicsTables } from "./_components/economics-tables";
import type { UserEconomicsReport } from "./_components/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

const PERIODS = [
  { value: "168", key: "period_7d" },
  { value: "720", key: "period_30d" },
  { value: "2160", key: "period_90d" },
  { value: "8760", key: "period_365d" },
  { value: "0", key: "period_all" },
] as const;

export default function UserEconomicsPage() {
  const t = useTranslations("UserEconomicsAdmin");
  const isAdmin = useRequireAdmin();
  const [emailInput, setEmailInput] = useState("");
  const [hours, setHours] = useState("720");
  const [data, setData] = useState<UserEconomicsReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(
    async (email: string, periodHours: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ hours: periodHours });
        const trimmed = email.trim();
        if (trimmed) params.set("email", trimmed);
        const response = await fetch(`${API_BASE_URL}/dashboard/admin/billing/user-economics?${params.toString()}`, {
          method: "GET",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        if (!response.ok) {
          const errBody = await parseDashboardApiError(response);
          if (isStepUpRequired(errBody)) return;
          throw new Error(dashboardApiErrorMessage(errBody, t("load_error")));
        }
        setData((await response.json()) as UserEconomicsReport);
      } catch (err) {
        setData(null);
        setError(err instanceof Error ? err.message : t("load_error"));
      } finally {
        setIsLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    if (!isAdmin) return;
    void fetchReport("", hours);
    // Load all users once when the admin lands on the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  if (!isAdmin) return null;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void fetchReport(emailInput, hours);
  };

  const onAllUsers = () => {
    setEmailInput("");
    void fetchReport("", hours);
  };

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">{t("page_title")}</h1>
          <p className="text-muted-foreground max-w-3xl">{t("page_description")}</p>
        </div>
        {data ? (
          <Badge variant="outline" className="w-fit">
            {data.scope === "all" ? t("scope_all") : t("scope_user", { email: data.email ?? "" })}
          </Badge>
        ) : null}
      </div>

      <form
        onSubmit={onSubmit}
        className="bg-card flex flex-col gap-3 rounded-xl border p-4 shadow-sm md:flex-row md:items-end"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Label htmlFor="user-economics-email">{t("email_label")}</Label>
          <Input
            id="user-economics-email"
            type="text"
            inputMode="email"
            autoComplete="off"
            spellCheck={false}
            placeholder={t("email_placeholder")}
            value={emailInput}
            onChange={(event) => setEmailInput(event.target.value)}
          />
        </div>
        <div className="flex w-full flex-col gap-2 md:w-44">
          <Label>{t("period_label")}</Label>
          <Select
            value={hours}
            onValueChange={(value) => {
              setHours(value);
              void fetchReport(emailInput, value);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODS.map((period) => (
                <SelectItem key={period.value} value={period.value}>
                  {t(period.key)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={isLoading}>
            <Search className="mr-2 h-4 w-4" />
            {t("search")}
          </Button>
          <Button type="button" variant="outline" disabled={isLoading} onClick={onAllUsers}>
            <Users className="mr-2 h-4 w-4" />
            {t("all_users")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={isLoading}
            onClick={() => void fetchReport(emailInput, hours)}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {t("refresh")}
          </Button>
        </div>
      </form>

      {data?.profile ? (
        <div className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span>
            {t("wallet")}: {formatCredits(data.profile.wallet.credits)} ({formatUsd(data.profile.wallet.usd)})
          </span>
          {data.profile.planId ? (
            <span>
              {t("plan")}: {data.profile.planId}
            </span>
          ) : null}
          {data.profile.membershipTier ? (
            <span>
              {t("tier")}: {data.profile.membershipTier}
            </span>
          ) : null}
          <span>
            {t("credit_price")}: {formatUsd(data.creditPriceUsd)}
          </span>
          <span>
            {t("runs")}: {data.runs.toLocaleString()}
          </span>
        </div>
      ) : data ? (
        <p className="text-muted-foreground text-sm">
          {t("credit_price")}: {formatUsd(data.creditPriceUsd)} · {t("runs")}: {data.runs.toLocaleString()}
        </p>
      ) : null}

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {isLoading && !data ? (
        <div className="text-muted-foreground flex min-h-[240px] items-center justify-center rounded-lg border border-dashed">
          {t("loading")}
        </div>
      ) : data ? (
        <>
          <EconomicsOverviewCards data={data} />
          <EconomicsCharts data={data} />
          <EconomicsTables
            data={data}
            onSelectUser={(identifier) => {
              setEmailInput(identifier);
              void fetchReport(identifier, hours);
            }}
          />
        </>
      ) : null}
    </div>
  );
}
