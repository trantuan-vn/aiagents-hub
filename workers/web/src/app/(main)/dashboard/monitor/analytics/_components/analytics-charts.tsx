"use client";

import { Bar, BarChart, Area, AreaChart, Pie, PieChart, Cell, XAxis, YAxis, CartesianGrid } from "recharts";

import { Button } from "@/components/ui/button";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";

import { formatDate, type AnalyticsData, type DailyUsage } from "./utils";

const chartConfig = {
  successCount: { label: "Successful", color: "#22c55e" },
  errorCount: { label: "Errors", color: "#ef4444" },
  requestCount: { label: "Requests", color: "#3b82f6" },
} satisfies ChartConfig;

const pieConfig = {
  success: { label: "Success", color: "#22c55e" },
  error: { label: "Error", color: "#ef4444" },
} satisfies ChartConfig;

const tickFormatter = (value: number) => (value >= 1000 ? `${Math.round(value / 1000)}k` : String(Math.round(value)));

function ChartEmpty({
  message,
  hint,
  onRetry,
  t,
  height = "h-[320px]",
}: {
  message: string;
  hint: string;
  onRetry?: () => void;
  t: (k: string) => string;
  height?: string;
}) {
  return (
    <div className={`flex ${height} flex-col items-center justify-center text-center`}>
      <p className="text-muted-foreground">{message}</p>
      <p className="text-muted-foreground mt-1 text-sm">{hint}</p>
      {onRetry && (
        <Button variant="outline" className="mt-4" onClick={onRetry}>
          {t("retry")}
        </Button>
      )}
    </div>
  );
}

function ChartError({ error, onRetry, t }: { error: string; onRetry: () => void; t: (k: string) => string }) {
  return (
    <div className="flex h-[320px] items-center justify-center">
      <p className="text-muted-foreground">{error}</p>
      <Button variant="outline" className="ml-4" onClick={onRetry}>
        {t("retry")}
      </Button>
    </div>
  );
}

interface ChartProps {
  isLoading: boolean;
  error: string | null;
  isEmpty: boolean;
  chartData: DailyUsage[];
  data: AnalyticsData | null;
  t: (k: string) => string;
  onRetry: () => void;
}

export function AnalyticsAreaChart({ isLoading, error, isEmpty, chartData, t, onRetry }: ChartProps) {
  if (isLoading) return <Skeleton className="h-[320px] w-full rounded-lg" />;
  if (error) return <ChartError error={error} onRetry={onRetry} t={t} />;
  if (isEmpty) return <ChartEmpty message={t("empty_chart")} hint={t("empty_hint")} onRetry={onRetry} t={t} />;
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[320px] w-full">
      <AreaChart data={chartData} margin={{ left: 0, right: 16, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="fillRequests" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-requestCount)" stopOpacity={0.4} />
            <stop offset="95%" stopColor="var(--color-requestCount)" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={40}
          tickFormatter={(value) => formatDate(value)}
        />
        <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} tickFormatter={tickFormatter} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(value) => formatDate(value)} />} />
        <Area
          type="monotone"
          dataKey="requestCount"
          stroke="var(--color-requestCount)"
          strokeWidth={2}
          fill="url(#fillRequests)"
        />
      </AreaChart>
    </ChartContainer>
  );
}

export function AnalyticsStackedBarChart({ isLoading, error, isEmpty, chartData, t, onRetry }: ChartProps) {
  if (isLoading) return <Skeleton className="h-[280px] w-full rounded-lg" />;
  if (error) return <ChartError error={error} onRetry={onRetry} t={t} />;
  if (isEmpty)
    return <ChartEmpty message={t("empty_chart")} hint={t("empty_hint")} onRetry={onRetry} t={t} height="h-[280px]" />;
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[280px] w-full">
      <BarChart data={chartData} margin={{ left: 0, right: 16, top: 8, bottom: 0 }} barCategoryGap="15%">
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={40}
          tickFormatter={(value) => formatDate(value)}
        />
        <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} tickFormatter={tickFormatter} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(value) => formatDate(value)} />} />
        <Bar dataKey="successCount" stackId="a" fill="var(--color-successCount)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="errorCount" stackId="a" fill="var(--color-errorCount)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}

export function AnalyticsPieChart({ isLoading, error, data, t, onRetry }: Omit<ChartProps, "chartData" | "isEmpty">) {
  if (isLoading) return <Skeleton className="h-[260px] w-full rounded-lg" />;
  if (error) return <ChartError error={error} onRetry={onRetry} t={t} />;

  const totalSuccess = (data?.daily ?? []).reduce((s, d) => s + d.successCount, 0);
  const totalErrors = (data?.daily ?? []).reduce((s, d) => s + d.errorCount, 0);

  if (totalSuccess === 0 && totalErrors === 0)
    return (
      <div className="flex h-[260px] flex-col items-center justify-center text-center">
        <p className="text-muted-foreground text-sm">{t("empty_hint")}</p>
      </div>
    );

  const pieData = [
    { name: t("chart.success"), value: totalSuccess, fill: "var(--color-success)" },
    { name: t("chart.error"), value: totalErrors, fill: "var(--color-error)" },
  ].filter((d) => d.value > 0);

  if (pieData.length === 0)
    return (
      <div className="flex h-[260px] flex-col items-center justify-center text-center">
        <p className="text-muted-foreground text-sm">{t("empty_hint")}</p>
      </div>
    );

  return (
    <ChartContainer config={pieConfig} className="aspect-auto h-[260px] w-full">
      <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
        <Pie
          data={pieData}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={90}
          paddingAngle={3}
          cornerRadius={8}
        >
          {pieData.map((entry) => (
            <Cell key={entry.name} fill={entry.fill} stroke="transparent" />
          ))}
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}
