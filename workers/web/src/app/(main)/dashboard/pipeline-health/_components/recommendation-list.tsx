"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import type { PipelineRecommendation } from "./types";

export function RecommendationList({ items }: { items: PipelineRecommendation[] }) {
  const t = useTranslations("PipelineHealthAdmin");
  if (!items.length) {
    return <p className="text-muted-foreground text-sm">{t("no_recommendations")}</p>;
  }
  return (
    <div className="grid gap-3">
      {items.map((r) => (
        <Card key={r.id}>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">{r.title}</CardTitle>
              <Badge variant={r.severity === "critical" ? "destructive" : "secondary"}>{r.severity}</Badge>
              <Badge variant="outline">
                {t("effort")} {r.effort}
              </Badge>
            </div>
            <CardDescription>{r.because}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <ul className="list-inside list-disc">
              {r.actions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
            {r.files.length ? (
              <p className="text-muted-foreground text-xs">{r.files.join(" · ")}</p>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
