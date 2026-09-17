"use client";

import { useTranslations } from "next-intl";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatCredits, formatUsd } from "@/lib/utils";

import type { UserEconomicsReport } from "./types";

const chartConfig = {
  hubRevenueUsd: { label: "Revenue", color: "var(--chart-1)" },
  cogsAiUsd: { label: "COGS", color: "var(--chart-2)" },
  contributionUsd: { label: "Contribution", color: "var(--chart-3)" },
} satisfies ChartConfig;

export function EconomicsCharts({ data }: { data: UserEconomicsReport }) {
  const t = useTranslations("UserEconomicsAdmin");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("trend_title")}</CardTitle>
        <CardDescription>{data.groupBy === "month" ? t("trend_month") : t("trend_day")}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.series.length > 0 ? (
          <ChartContainer config={chartConfig} className="h-64 w-full">
            <AreaChart data={data.series} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="period" tickLine={false} tickMargin={8} axisLine={false} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name, item) => {
                      const label =
                        name === "hubRevenueUsd"
                          ? t("hub_revenue")
                          : name === "cogsAiUsd"
                            ? t("cogs_ai")
                            : t("contribution");
                      const extra =
                        name === "hubRevenueUsd" && item?.payload?.creditsCharged != null
                          ? ` · ${formatCredits(item.payload.creditsCharged as number)}`
                          : "";
                      return [`${formatUsd(value as number)}${extra}`, label];
                    }}
                  />
                }
              />
              <Area
                dataKey="hubRevenueUsd"
                fill="var(--color-hubRevenueUsd)"
                fillOpacity={0.12}
                stroke="var(--color-hubRevenueUsd)"
                strokeWidth={2}
                type="monotone"
              />
              <Area
                dataKey="cogsAiUsd"
                fill="var(--color-cogsAiUsd)"
                fillOpacity={0.08}
                stroke="var(--color-cogsAiUsd)"
                strokeWidth={2}
                type="monotone"
              />
              <Area
                dataKey="contributionUsd"
                fill="var(--color-contributionUsd)"
                fillOpacity={0.16}
                stroke="var(--color-contributionUsd)"
                strokeWidth={2}
                type="monotone"
              />
            </AreaChart>
          </ChartContainer>
        ) : (
          <div className="text-muted-foreground flex h-32 items-center justify-center text-sm">{t("no_data")}</div>
        )}
      </CardContent>
    </Card>
  );
}
