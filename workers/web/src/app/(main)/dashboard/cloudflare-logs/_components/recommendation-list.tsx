"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import type { StabilityRecommendation } from "./types";

export function RecommendationList({ items }: { items: StabilityRecommendation[] }) {
  const t = useTranslations("CloudflareLogsAdmin");
  if (!items.length) {
    return <p className="text-muted-foreground text-sm">{t("no_recommendations")}</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {items.map((rec) => (
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
            <ul className="list-disc pl-5">
              {rec.actions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
            {rec.files.length ? (
              <p className="text-muted-foreground font-mono text-xs">{rec.files.join(" · ")}</p>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
