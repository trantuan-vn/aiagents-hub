"use client";

import { ShoppingBasket, TramFront, Ellipsis } from "lucide-react";
import { useTranslations } from "next-intl";
import { Label, PolarRadiusAxis, RadialBar, RadialBarChart } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Separator } from "@/components/ui/separator";
import { formatUsd } from "@/lib/utils";

const chartData = [{ period: "last-week", groceries: 380, transport: 120, other: 80 }];

export function ExpenseSummary() {
  const t = useTranslations("Finance");

  const chartConfig = {
    groceries: {
      label: t("groceries"),
      color: "var(--chart-1)",
    },
    transport: {
      label: t("transport"),
      color: "var(--chart-2)",
    },
    other: {
      label: t("other"),
      color: "var(--chart-3)",
    },
  } satisfies ChartConfig;

  const totalExpenses = chartData.length ? chartData[0].groceries + chartData[0].transport + chartData[0].other : 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("expense_summary")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Separator />

        <div className="h-32">
          <ChartContainer config={chartConfig}>
            <RadialBarChart
              margin={{ left: 0, right: 0, top: 0, bottom: 0 }}
              data={chartData}
              endAngle={180}
              innerRadius={80}
              outerRadius={130}
            >
              <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
              <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
                <Label
                  content={({ viewBox }) => {
                    if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                      return (
                        <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle">
                          <tspan
                            x={viewBox.cx}
                            y={(viewBox.cy ?? 0) - 16}
                            className="fill-foreground text-2xl font-bold tabular-nums"
                          >
                            {formatUsd(totalExpenses)}
                          </tspan>
                          <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 4} className="fill-muted-foreground">
                            {t("spent")}
                          </tspan>
                        </text>
                      );
                    }
                  }}
                />
              </PolarRadiusAxis>
              <RadialBar
                dataKey="other"
                stackId="a"
                cornerRadius={4}
                fill="var(--color-other)"
                className="stroke-card stroke-4"
              />
              <RadialBar
                dataKey="transport"
                stackId="a"
                cornerRadius={4}
                fill="var(--color-transport)"
                className="stroke-card stroke-4"
              />
              <RadialBar
                dataKey="groceries"
                stackId="a"
                cornerRadius={4}
                fill="var(--color-groceries)"
                className="stroke-card stroke-4"
              />
            </RadialBarChart>
          </ChartContainer>
        </div>
        <Separator />
        <div className="flex justify-between gap-4">
          <div className="flex flex-1 flex-col items-center space-y-2">
            <div className="bg-muted flex size-10 items-center justify-center rounded-full">
              <ShoppingBasket className="stroke-chart-1 size-5" />
            </div>
            <div className="space-y-0.5 text-center">
              <p className="text-muted-foreground text-xs uppercase">{t("groceries")}</p>
              <p className="font-medium tabular-nums">{formatUsd(chartData[0].groceries)}</p>
            </div>
          </div>
          <Separator orientation="vertical" className="!h-auto" />
          <div className="flex flex-1 flex-col items-center space-y-2">
            <div className="bg-muted flex size-10 items-center justify-center rounded-full">
              <TramFront className="stroke-chart-2 size-5" />
            </div>
            <div className="space-y-0.5 text-center">
              <p className="text-muted-foreground text-xs uppercase">{t("transport")}</p>
              <p className="font-medium tabular-nums">{formatUsd(chartData[0].transport)}</p>
            </div>
          </div>
          <Separator orientation="vertical" className="!h-auto" />
          <div className="flex flex-1 flex-col items-center space-y-2">
            <div className="bg-muted flex size-10 items-center justify-center rounded-full">
              <Ellipsis className="stroke-chart-3 size-5" />
            </div>
            <div className="space-y-0.5 text-center">
              <p className="text-muted-foreground text-xs uppercase">{t("other")}</p>
              <p className="font-medium tabular-nums">{formatUsd(chartData[0].other)}</p>
            </div>
          </div>
        </div>
        <span className="text-muted-foreground text-xs tabular-nums">
          {t("weekly_spending_capped")} {formatUsd(2000)}
        </span>
      </CardContent>
    </Card>
  );
}
