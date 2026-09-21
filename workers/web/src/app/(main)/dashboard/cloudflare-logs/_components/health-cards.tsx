"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { shortScript, type LogsOverviewDto } from "./types";

function statusClass(status: string): string {
  if (status === "incident") return "border-destructive/50 bg-destructive/5";
  if (status === "watch") return "border-amber-500/40 bg-amber-500/5";
  if (status === "unavailable") return "border-muted";
  return "";
}

function fmtCount(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString();
}

export function HealthCards({ data }: { data: LogsOverviewDto }) {
  const t = useTranslations("CloudflareLogsAdmin");
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>{t("open_groups")}</CardDescription>
          <CardTitle>{data.openCount}</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          {t("new_1h")}: {data.new1h}
        </CardContent>
      </Card>
      {data.workers.map((w) => (
        <Card key={w.scriptName} className={statusClass(w.status)}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">{shortScript(w.scriptName)}</CardTitle>
              <Badge variant={w.status === "incident" ? "destructive" : "secondary"}>{w.status}</Badge>
            </div>
            <CardDescription>{w.scriptName}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              {t("error_rate")}:{" "}
              {w.errorRatePct == null ? t("no_data") : `${w.errorRatePct.toFixed(2)}%`}
            </div>
            <div>
              {t("obs_errors")}: {fmtCount(w.observabilityErrors)} / {fmtCount(w.observabilityEvents)}
            </div>
            <div className="text-muted-foreground">
              {t("graphql_exceptions")}: {fmtCount(w.graphqlErrors)}
            </div>
            {w.sampled ? <div className="text-amber-700 dark:text-amber-400">{t("sampled_warning")}</div> : null}
            {w.sparkline.length ? (
              <div className="text-muted-foreground flex h-6 items-end gap-px">
                {w.sparkline.map((v, i) => (
                  <span
                    key={`${w.scriptName}-${i}`}
                    className="bg-primary/70 w-1 min-h-px"
                    style={{ height: `${Math.min(100, 8 + v * 4)}%` }}
                  />
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
