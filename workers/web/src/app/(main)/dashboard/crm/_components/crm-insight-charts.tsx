"use client";

import { useTranslations } from "next-intl";
import { Area, AreaChart, Line, LineChart, Pie, PieChart, XAxis } from "recharts";

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

import type { AdminCrmStats } from "../page";

const usersBySourceConfig = {
  referral: { label: "Referral", color: "var(--chart-2)" },
  direct: { label: "Direct", color: "var(--chart-1)" },
  leads: { label: "Leads" },
} satisfies ChartConfig;

const newUsersConfig = {
  total: { label: "Total", color: "var(--chart-1)" },
  referred: { label: "Referral", color: "var(--chart-2)" },
  direct: { label: "Direct", color: "var(--chart-3)" },
} satisfies ChartConfig;

const revenueConfig = {
  revenue: { label: "Revenue", color: "var(--chart-1)" },
  orders: { label: "Orders", color: "var(--chart-2)" },
} satisfies ChartConfig;

interface CrmInsightChartsProps {
  stats: AdminCrmStats;
}

export function CrmInsightCharts({ stats }: CrmInsightChartsProps) {
  const t = useTranslations("CRM");

  const usersBySourceData = stats.usersBySource.map((item) => ({
    ...item,
    name: item.source === "referral" ? t("referral") : t("direct"),
  }));

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {/* Users by source - Pie */}
      <Card>
        <CardHeader>
          <CardTitle>{t("users_by_source")}</CardTitle>
          <CardDescription>{t("this_month")}</CardDescription>
        </CardHeader>
        <CardContent className="max-h-48">
          {usersBySourceData.length > 0 ? (
            <ChartContainer config={usersBySourceConfig} className="size-full">
              <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                <Pie
                  data={usersBySourceData}
                  dataKey="count"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={70}
                  paddingAngle={2}
                  cornerRadius={4}
                />
              </PieChart>
            </ChartContainer>
          ) : (
            <div className="text-muted-foreground flex h-32 items-center justify-center text-sm">{t("no_data")}</div>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          {usersBySourceData.map((item) => (
            <div key={item.source} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ background: item.fill }} />
              <span className="text-xs">
                {item.source === "referral" ? t("referral") : t("direct")}: {item.count}
              </span>
            </div>
          ))}
        </CardFooter>
      </Card>

      {/* New users trend - Area */}
      <Card>
        <CardHeader>
          <CardTitle>{t("new_users_trend")}</CardTitle>
          <CardDescription>{t("last_30_days")}</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.newUsersByDate.length > 0 ? (
            <ChartContainer config={newUsersConfig} className="h-40 w-full">
              <AreaChart data={stats.newUsersByDate}>
                <XAxis dataKey="date" tickLine={false} tickMargin={8} axisLine={false} hide />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  dataKey="total"
                  fill="var(--color-total)"
                  fillOpacity={0.2}
                  stroke="var(--color-total)"
                  strokeWidth={2}
                  type="monotone"
                />
                <Area
                  dataKey="referred"
                  fill="var(--color-referred)"
                  fillOpacity={0.15}
                  stroke="var(--color-referred)"
                  strokeWidth={1.5}
                  type="monotone"
                />
                <Area
                  dataKey="direct"
                  fill="var(--color-direct)"
                  fillOpacity={0.1}
                  stroke="var(--color-direct)"
                  strokeWidth={1.5}
                  type="monotone"
                />
              </AreaChart>
            </ChartContainer>
          ) : (
            <div className="text-muted-foreground flex h-32 items-center justify-center text-sm">{t("no_data")}</div>
          )}
        </CardContent>
      </Card>

      {/* Revenue trend - Line */}
      <Card>
        <CardHeader>
          <CardTitle>{t("revenue_trend")}</CardTitle>
          <CardDescription>{t("last_months")}</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.revenueByMonth.length > 0 ? (
            <ChartContainer config={revenueConfig} className="h-40 w-full">
              <LineChart data={stats.revenueByMonth}>
                <XAxis dataKey="month" tickLine={false} tickMargin={8} axisLine={false} hide />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--color-revenue)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ChartContainer>
          ) : (
            <div className="text-muted-foreground flex h-32 items-center justify-center text-sm">{t("no_data")}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
