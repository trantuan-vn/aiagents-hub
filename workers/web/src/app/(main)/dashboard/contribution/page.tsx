"use client";

import { useCallback, useEffect, useState } from "react";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCredits, formatUsd } from "@/lib/utils";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

type ClassRow = {
  modelClass: string;
  runs: number;
  creditsCharged: number;
  revenueUsd: number;
  cogsAiUsd: number;
  contributionUsd: number;
  contributionPct: number;
};

type WorkflowRow = {
  workflowId: number;
  runs: number;
  revenueUsd: number;
  contributionUsd: number;
  contributionPct: number;
};

type ProposalRow = {
  id: string;
  modelClass: string;
  observedContributionPct: number;
  deltaPct: number;
  emergency: boolean;
  status: "proposed" | "applied" | "dismissed";
  createdAt: string;
  effectiveAtPro?: string;
  effectiveAtEnt?: string;
};

type ContributionReport = {
  hours: number;
  byClass: ClassRow[];
  losingWorkflows: WorkflowRow[];
  blendedContributionPct: number;
  creditsCharged: number;
  revenueUsd: number;
  cogsAiUsd: number;
  proposals: ProposalRow[];
};

export default function ContributionPage() {
  const t = useTranslations("ContributionAdmin");
  const [data, setData] = useState<ContributionReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/dashboard/admin/billing/contribution?hours=24`, {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error((await response.text()) || t("load_error"));
      setData((await response.json()) as ContributionReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("load_error"));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void fetchReport();
  }, [fetchReport]);

  const scan = async (): Promise<void> => {
    setScanning(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/dashboard/admin/billing/contribution/scan`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error((await response.text()) || t("scan_error"));
      const result = (await response.json()) as { report?: ContributionReport };
      if (result.report) setData(result.report);
      else await fetchReport();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("scan_error"));
    } finally {
      setScanning(false);
    }
  };

  const act = async (id: string, action: "confirm" | "dismiss"): Promise<void> => {
    setActingId(id);
    try {
      const response = await fetch(`${API_BASE_URL}/dashboard/admin/billing/contribution/proposals/${id}/${action}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error((await response.text()) || t("action_error"));
      await fetchReport();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("action_error"));
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">{t("page_title")}</h1>
          <p className="text-muted-foreground">{t("page_description")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void fetchReport()} disabled={isLoading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {t("refresh")}
          </Button>
          <Button onClick={() => void scan()} disabled={scanning}>
            {scanning ? t("scanning") : t("scan")}
          </Button>
        </div>
      </div>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {isLoading && !data ? (
        <div className="text-muted-foreground flex min-h-[240px] items-center justify-center rounded-lg border border-dashed">
          {t("loading")}
        </div>
      ) : data ? (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{t("blended")}</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">{data.blendedContributionPct.toFixed(1)}%</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{t("credits")}</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">{formatCredits(data.creditsCharged)}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{t("revenue")}</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">{formatUsd(data.revenueUsd)}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{t("cogs")}</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">{formatUsd(data.cogsAiUsd)}</CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t("by_class")}</CardTitle>
              <CardDescription>{t("window", { hours: String(data.hours) })}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("class")}</TableHead>
                    <TableHead className="text-right">{t("runs")}</TableHead>
                    <TableHead className="text-right">{t("credits")}</TableHead>
                    <TableHead className="text-right">{t("revenue")}</TableHead>
                    <TableHead className="text-right">{t("contribution")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.byClass.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-muted-foreground">
                        {t("no_data")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.byClass.map((row) => (
                      <TableRow key={row.modelClass}>
                        <TableCell className="font-medium">{row.modelClass}</TableCell>
                        <TableCell className="text-right">{row.runs}</TableCell>
                        <TableCell className="text-right">{formatCredits(row.creditsCharged)}</TableCell>
                        <TableCell className="text-right">{formatUsd(row.revenueUsd)}</TableCell>
                        <TableCell className="text-right">{row.contributionPct.toFixed(1)}%</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("proposals")}</CardTitle>
              <CardDescription>{t("proposals_description")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("class")}</TableHead>
                    <TableHead>{t("status")}</TableHead>
                    <TableHead className="text-right">{t("observed")}</TableHead>
                    <TableHead className="text-right">{t("delta")}</TableHead>
                    <TableHead>{t("effective_pro")}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.proposals.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-muted-foreground">
                        {t("no_proposals")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.proposals.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">
                          <span className="inline-flex items-center gap-1">
                            {row.emergency ? <AlertTriangle className="text-destructive h-4 w-4" /> : null}
                            {row.modelClass}
                          </span>
                        </TableCell>
                        <TableCell>{row.status}</TableCell>
                        <TableCell className="text-right">{row.observedContributionPct.toFixed(1)}%</TableCell>
                        <TableCell className="text-right">{row.deltaPct.toFixed(1)}%</TableCell>
                        <TableCell>
                          {row.effectiveAtPro ? new Date(row.effectiveAtPro).toLocaleDateString() : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.status === "proposed" ? (
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                disabled={actingId === row.id}
                                onClick={() => void act(row.id, "confirm")}
                              >
                                {t("confirm")}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={actingId === row.id}
                                onClick={() => void act(row.id, "dismiss")}
                              >
                                {t("dismiss")}
                              </Button>
                            </div>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("losing")}</CardTitle>
              <CardDescription>{t("losing_description")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("workflow")}</TableHead>
                    <TableHead className="text-right">{t("runs")}</TableHead>
                    <TableHead className="text-right">{t("revenue")}</TableHead>
                    <TableHead className="text-right">{t("contribution")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.losingWorkflows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground">
                        {t("no_data")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.losingWorkflows.map((row) => (
                      <TableRow key={row.workflowId}>
                        <TableCell className="font-medium">{row.workflowId}</TableCell>
                        <TableCell className="text-right">{row.runs}</TableCell>
                        <TableCell className="text-right">{formatUsd(row.revenueUsd)}</TableCell>
                        <TableCell className="text-right">{row.contributionPct.toFixed(1)}%</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
