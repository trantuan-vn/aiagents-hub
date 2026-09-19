"use client";

import { useTranslations } from "next-intl";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { formatWhen } from "./format";
import type { OverviewDto } from "./types";

export function ExhaustTimeline({ data }: { data: OverviewDto }) {
  const t = useTranslations("CloudflareUsageAdmin");
  const start = new Date(data.plans.workers.periodStart).getTime();
  const end = new Date(data.plans.workers.periodEnd).getTime();
  const span = Math.max(1, end - start);
  const nowPct = Math.min(100, Math.max(0, ((Date.now() - start) / span) * 100));
  const markers = data.metrics
    .filter((m) => m.exhaustAt)
    .map((m) => ({
      id: m.metricId,
      label: m.label,
      at: m.exhaustAt as string,
      pct: Math.min(100, Math.max(0, ((new Date(m.exhaustAt as string).getTime() - start) / span) * 100)),
      hot: m.status === "over" || m.status === "projected_over" || m.status === "hard_stop_today",
    }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("timeline")}</CardTitle>
        <CardDescription>{t("timeline_desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative h-3 rounded-full bg-muted">
          <div className="bg-primary/30 absolute inset-y-0 left-0 rounded-full" style={{ width: `${nowPct}%` }} />
          <div className="bg-primary absolute top-1/2 h-3 w-0.5 -translate-y-1/2" style={{ left: `${nowPct}%` }} title={t("today")} />
          {markers.map((m) => (
            <div
              key={m.id}
              className={cn(
                "absolute top-1/2 h-3 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-sm",
                m.hot ? "bg-destructive" : "bg-amber-500",
              )}
              title={`${m.label}: ${formatWhen(m.at)}`}
              style={{ left: `${m.pct}%` }}
            />
          ))}
        </div>
        <ul className="text-muted-foreground grid gap-1 text-sm md:grid-cols-2">
          {markers.length === 0 ? <li>{t("no_exhaust_this_period")}</li> : null}
          {markers.map((m) => (
            <li key={m.id}>
              <span className="text-foreground font-medium">{m.label}</span> · {formatWhen(m.at)}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
