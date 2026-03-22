"use client";

import { useTranslations } from "next-intl";
import { Area, AreaChart, Bar, BarChart, Pie, PieChart, XAxis } from "recharts";

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatCurrency } from "@/lib/utils";

import type { AdminFinanceStats } from "../page";

const ordersByStatusConfig = {
  COMPLETED: { label: "Completed", color: "var(--chart-1)" },
  PENDING: { label: "Pending", color: "var(--chart-2)" },
  CANCELLED: { label: "Cancelled", color: "var(--chart-3)" },
  CONFIRMED: { label: "Confirmed", color: "var(--chart-4)" },
  PROCESSING: { label: "Processing", color: "var(--chart-5)" },
} satisfies ChartConfig;

const revenueConfig = {
  revenue: { label: "Revenue", color: "var(--chart-1)" },
  orders: { label: "Orders", color: "var(--chart-2)" },
} satisfies ChartConfig;

interface FinanceInsightChartsProps {
  stats: AdminFinanceStats;
}

export function FinanceInsightCharts({ stats }: FinanceInsightChartsProps) {
  const t = useTranslations("FinanceAdmin");

  const ordersByStatusData = stats.ordersByStatus.map((item) => ({
    ...item,
    name: t(`status_${item.status.toLowerCase()}`),
  }));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {/* Orders by status - Pie */}
      <Card>
        <CardHeader>
          <CardTitle>{t("orders_by_status")}</CardTitle>
          <CardDescription>{t("this_month")}</CardDescription>
        </CardHeader>
        <CardContent className="max-h-48">
          {ordersByStatusData.length > 0 ? (
            <ChartContainer config={ordersByStatusConfig} className="size-full">
              <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      hideLabel
                      formatter={(value, name, item: { payload?: { count: number; amount: number; name: string } }) =>
                        item.payload
                          ? [
                              `${item.payload.count} ${t("orders")} · ${formatCurrency(item.payload.amount, { currency: "VND", noDecimals: true })}`,
                              item.payload.name,
                            ]
                          : [value, name]
                      }
                    />
                  }
                />
                <Pie
                  data={ordersByStatusData}
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
          {ordersByStatusData.map((item) => (
            <div key={item.status} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ background: item.fill }} />
              <span className="text-xs">
                {t(`status_${item.status.toLowerCase()}`)}: {item.count}
              </span>
            </div>
          ))}
        </CardFooter>
      </Card>

      {/* Revenue by month - Bar */}
      <Card>
        <CardHeader>
          <CardTitle>{t("revenue_by_month")}</CardTitle>
          <CardDescription>{t("last_months")}</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.revenueByMonth.length > 0 ? (
            <ChartContainer config={revenueConfig} className="h-48 w-full">
              <BarChart data={stats.revenueByMonth} margin={{ left: -20, right: 0, top: 10, bottom: 0 }}>
                <XAxis dataKey="month" tickLine={false} tickMargin={8} axisLine={false} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => formatCurrency(value as number, { currency: "VND", noDecimals: true })}
                    />
                  }
                />
                <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          ) : (
            <div className="text-muted-foreground flex h-32 items-center justify-center text-sm">{t("no_data")}</div>
          )}
        </CardContent>
      </Card>

      {/* Daily cash flow - Area */}
      <Card>
        <CardHeader>
          <CardTitle>{t("daily_revenue")}</CardTitle>
          <CardDescription>{t("last_30_days")}</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.revenueByDay.length > 0 ? (
            <ChartContainer config={revenueConfig} className="h-48 w-full">
              <AreaChart data={stats.revenueByDay}>
                <XAxis dataKey="date" tickLine={false} tickMargin={8} axisLine={false} hide />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => formatCurrency(value as number, { currency: "VND", noDecimals: true })}
                    />
                  }
                />
                <Area
                  dataKey="revenue"
                  fill="var(--color-revenue)"
                  fillOpacity={0.2}
                  stroke="var(--color-revenue)"
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
    </div>
  );
}
