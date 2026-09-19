"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { formatMoney } from "./format";
import type { OverviewDto } from "./types";

export function RecommendationList({ data }: { data: OverviewDto }) {
  const t = useTranslations("CloudflareUsageAdmin");
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold">{t("recommendations")}</h2>
        <p className="text-muted-foreground text-sm">{t("advisory_only")}</p>
      </div>
      {data.recommendations.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("no_recommendations")}</p>
      ) : (
        data.recommendations.map((rec) => (
          <Card key={rec.id}>
            <CardHeader className="gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">{rec.title}</CardTitle>
                <Badge variant={rec.severity === "critical" || rec.severity === "high" ? "destructive" : "secondary"}>
                  {rec.severity}
                </Badge>
                <Badge variant="outline">{t("effort")}: {rec.effort}</Badge>
              </div>
              <CardDescription>{rec.because}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>
                {t("usd_saved")}: {formatMoney(rec.usdSavedPerMonth.min)} – {formatMoney(rec.usdSavedPerMonth.max)}
              </div>
              <ul className="list-disc pl-5">
                {rec.actions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
