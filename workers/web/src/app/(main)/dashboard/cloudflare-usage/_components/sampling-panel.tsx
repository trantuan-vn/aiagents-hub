"use client";

import { useCallback, useEffect, useState } from "react";

import { useTranslations } from "next-intl";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dashboardApiErrorMessage, isStepUpRequired, parseDashboardApiError } from "@/lib/dashboard-api-error";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

type SamplingScript = {
  scriptName: string;
  applyAllowed: boolean;
  enabled: boolean;
  headSamplingRate: number | null;
  readable: boolean;
  error?: string;
};

type SamplingDto = {
  scripts: SamplingScript[];
  lastApply: { at: string; actor: string; rate: number } | null;
  defaultRate: number;
};

export function SamplingPanel() {
  const t = useTranslations("CloudflareUsageAdmin");
  const [data, setData] = useState<SamplingDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/dashboard/admin/cloudflare/sampling`, {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        const errBody = await parseDashboardApiError(response);
        if (isStepUpRequired(errBody)) return;
        throw new Error(dashboardApiErrorMessage(errBody, t("sampling_error")));
      }
      setData((await response.json()) as SamplingDto);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("sampling_error"));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const post = async (path: string) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/dashboard/admin/cloudflare/${path}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true, rate: data?.defaultRate ?? 0.05 }),
      });
      if (!response.ok) {
        const errBody = await parseDashboardApiError(response);
        if (isStepUpRequired(errBody)) return;
        throw new Error(dashboardApiErrorMessage(errBody, t("sampling_error")));
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("sampling_error"));
    } finally {
      setBusy(false);
    }
  };

  const pct = (rate: number | null) => (rate == null ? "—" : `${Math.round(rate * 1000) / 10}%`);

  return (
    <Card>
      <CardHeader className="gap-2">
        <CardTitle>{t("sampling_title")}</CardTitle>
        <CardDescription>{t("sampling_desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("col_name")}</TableHead>
              <TableHead>{t("sampling_rate")}</TableHead>
              <TableHead>{t("col_status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.scripts ?? []).map((row) => (
              <TableRow key={row.scriptName}>
                <TableCell className="font-medium">{row.scriptName}</TableCell>
                <TableCell>{pct(row.headSamplingRate)}</TableCell>
                <TableCell>
                  <Badge variant={row.applyAllowed ? "outline" : "secondary"}>
                    {row.applyAllowed ? t("sampling_safe") : t("sampling_keep_full")}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex flex-wrap gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={busy}>{t("sampling_apply")}</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("sampling_apply")}</AlertDialogTitle>
                <AlertDialogDescription>{t("sampling_apply_confirm")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("sampling_cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={() => void post("sampling/apply")}>{t("sampling_confirm")}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={busy || !data?.lastApply}>
                {t("sampling_rollback")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("sampling_rollback")}</AlertDialogTitle>
                <AlertDialogDescription>{t("sampling_rollback_confirm")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("sampling_cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={() => void post("sampling/rollback")}>{t("sampling_confirm")}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        {data?.lastApply ? (
          <p className="text-muted-foreground text-xs">
            {t("sampling_last")}: {data.lastApply.rate} · {data.lastApply.at}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
