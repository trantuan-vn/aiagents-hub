"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { statusClass, type PipelineOverviewDto } from "./types";

export function StageStrip({ data }: { data: PipelineOverviewDto }) {
  const t = useTranslations("PipelineHealthAdmin");
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {data.stages.map((s) => (
        <Card key={s.stage} className={statusClass(s.status)}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">{t(`stage_${s.stage}`)}</CardTitle>
              <Badge variant={s.status === "incident" ? "destructive" : "secondary"}>{s.status}</Badge>
            </div>
            <CardDescription className="line-clamp-2">{s.summary}</CardDescription>
          </CardHeader>
          <CardContent className="text-muted-foreground space-y-1 text-xs">
            {Object.entries(s.metrics)
              .slice(0, 4)
              .map(([k, v]) => (
                <div key={k}>
                  {k}: {v == null ? "—" : String(v)}
                </div>
              ))}
            {s.sampled ? <div className="text-amber-700 dark:text-amber-400">{t("sample_confidence")}</div> : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
