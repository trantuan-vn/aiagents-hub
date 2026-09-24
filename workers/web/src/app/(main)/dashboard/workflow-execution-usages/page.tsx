"use client";

import { type FormEvent, useCallback, useState } from "react";

import { RefreshCw, Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dashboardApiErrorMessage, isStepUpRequired, parseDashboardApiError } from "@/lib/dashboard-api-error";
import { formatCredits } from "@/lib/utils";

import { useRequireAdmin } from "../_hooks/use-require-admin";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

type ExecutionRow = {
  executionKey: string;
  workflowId: number;
  workflowName?: string;
  status: string;
  totalCreditsCharged?: number;
  totalCostVnd?: number;
  stepCount?: number;
  startedAt?: number;
  user_id?: string;
};

type UsageRow = {
  id?: number;
  serviceId: number;
  endpoint: string;
  creditsCharged?: number;
  isError?: boolean | number;
  modelId?: string;
  created_at?: number;
};

type Report = {
  execution: ExecutionRow | null;
  usageCount: number;
  usageCredits: number;
  usageErrors: number;
  usages: UsageRow[];
  hasMore: boolean;
  recentExecutions: ExecutionRow[];
};

function formatTs(ts?: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

export default function WorkflowExecutionUsagesPage() {
  const t = useTranslations("WorkflowExecutionUsagesAdmin");
  const isAdmin = useRequireAdmin();
  const [executionKey, setExecutionKey] = useState("");
  const [data, setData] = useState<Report | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(
    async (key: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (key.trim()) params.set("executionKey", key.trim());
        const response = await fetch(
          `${API_BASE_URL}/dashboard/admin/billing/workflow-execution-usages?${params.toString()}`,
          { method: "GET", credentials: "include", headers: { "Content-Type": "application/json" } },
        );
        if (!response.ok) {
          const errBody = await parseDashboardApiError(response);
          if (isStepUpRequired(errBody)) return;
          throw new Error(dashboardApiErrorMessage(errBody, t("load_error")));
        }
        setData((await response.json()) as Report);
      } catch (err) {
        setData(null);
        setError(err instanceof Error ? err.message : t("load_error"));
      } finally {
        setIsLoading(false);
      }
    },
    [t],
  );

  if (!isAdmin) return null;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void fetchReport(executionKey);
  };

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">{t("page_title")}</h1>
        <p className="text-muted-foreground max-w-3xl">{t("page_description")}</p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <Label htmlFor="execution-key">{t("execution_key_label")}</Label>
          <Input
            id="execution-key"
            value={executionKey}
            onChange={(e) => setExecutionKey(e.target.value)}
            placeholder={t("execution_key_placeholder")}
          />
        </div>
        <Button type="submit" disabled={isLoading}>
          <Search className="mr-2 h-4 w-4" />
          {t("search")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isLoading}
          onClick={() => void fetchReport("")}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          {t("recent")}
        </Button>
      </form>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {data?.execution ? (
        <div className="bg-card space-y-2 rounded-lg border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">{t("execution_heading")}</h2>
            <Badge variant="outline" className="capitalize">
              {data.execution.status}
            </Badge>
          </div>
          <p className="font-mono text-xs">{data.execution.executionKey}</p>
          <p className="text-sm">
            {data.execution.workflowName || `#${data.execution.workflowId}`} ·{" "}
            {formatCredits(Number(data.execution.totalCreditsCharged ?? data.execution.totalCostVnd ?? 0))} ·{" "}
            {t("steps", { count: data.execution.stepCount ?? 0 })}
          </p>
          <div className="flex flex-wrap gap-3 text-sm">
            <span>
              {t("usage_count")}: <strong>{data.usageCount}</strong>
            </span>
            <span>
              {t("usage_credits")}: <strong>{formatCredits(data.usageCredits)}</strong>
            </span>
            <span>
              {t("usage_errors")}: <strong>{data.usageErrors}</strong>
            </span>
          </div>
        </div>
      ) : null}

      {data && data.usages.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("col_time")}</TableHead>
                <TableHead>{t("col_endpoint")}</TableHead>
                <TableHead>{t("col_model")}</TableHead>
                <TableHead className="text-right">{t("col_credits")}</TableHead>
                <TableHead>{t("col_error")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.usages.map((u) => (
                <TableRow key={u.id ?? `${u.serviceId}-${u.created_at}`}>
                  <TableCell className="text-xs whitespace-nowrap">{formatTs(u.created_at)}</TableCell>
                  <TableCell className="max-w-[240px] truncate font-mono text-xs">{u.endpoint}</TableCell>
                  <TableCell className="text-xs">{u.modelId ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatCredits(Number(u.creditsCharged ?? 0))}
                  </TableCell>
                  <TableCell>{u.isError === true || u.isError === 1 ? t("yes") : t("no")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {data && data.recentExecutions.length > 0 ? (
        <div className="space-y-2">
          <h2 className="font-semibold">{t("recent_heading")}</h2>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("col_time")}</TableHead>
                  <TableHead>{t("col_workflow")}</TableHead>
                  <TableHead>{t("col_status")}</TableHead>
                  <TableHead className="text-right">{t("col_credits")}</TableHead>
                  <TableHead>{t("col_key")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentExecutions.map((row) => (
                  <TableRow
                    key={row.executionKey}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => {
                      setExecutionKey(row.executionKey);
                      void fetchReport(row.executionKey);
                    }}
                  >
                    <TableCell className="text-xs whitespace-nowrap">{formatTs(row.startedAt)}</TableCell>
                    <TableCell>{row.workflowName || `#${row.workflowId}`}</TableCell>
                    <TableCell className="capitalize">{row.status}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatCredits(Number(row.totalCreditsCharged ?? row.totalCostVnd ?? 0))}
                    </TableCell>
                    <TableCell className="max-w-[120px] truncate font-mono text-xs">{row.executionKey}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
