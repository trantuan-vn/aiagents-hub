"use client";

import { Bar, BarChart, XAxis, YAxis, CartesianGrid } from "recharts";

import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

interface ExecutionLog {
  status: string;
  startedAt?: number;
}

interface LogsOverviewChartProps {
  logs: ExecutionLog[];
  t: (key: string, values?: Record<string, string | number>) => string;
}

const chartConfig = {
  success: { label: "Completed", color: "#22c55e" },
  error: { label: "Failed", color: "#ef4444" },
} satisfies ChartConfig;

function groupByHour(logs: ExecutionLog[]): { hour: string; success: number; error: number }[] {
  const buckets: Record<string, { success: number; error: number }> = {};
  for (const log of logs) {
    if (!log.startedAt) continue;
    const d = new Date(typeof log.startedAt === "number" && log.startedAt < 1e12 ? log.startedAt * 1000 : log.startedAt);
    const key = d.toISOString().slice(0, 13);
    if (!(key in buckets)) buckets[key] = { success: 0, error: 0 };
    const bucket = buckets[key]!;
    if (log.status === "failed") bucket.error++;
    else if (log.status === "completed") bucket.success++;
  }
  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hour, v]) => ({
      hour: new Date(hour + ":00:00").toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
      success: v.success,
      error: v.error,
    }));
}

export function LogsOverviewChart({ logs, t }: LogsOverviewChartProps) {
  const data = groupByHour(logs);
  const hasData = data.some((d) => d.success > 0 || d.error > 0);
  if (!hasData || logs.length === 0) return null;

  return (
    <div className="bg-card rounded-xl border p-4 shadow-sm">
      <div className="mb-3">
        <h3 className="font-semibold">{t("chart.title")}</h3>
        <p className="text-muted-foreground text-sm">{t("chart.description")}</p>
      </div>
      <ChartContainer config={chartConfig} className="h-[180px] w-full">
        <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="hour" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="success" stackId="a" fill="var(--color-success)" radius={[0, 0, 0, 0]} />
          <Bar dataKey="error" stackId="a" fill="var(--color-error)" radius={[0, 0, 0, 0]} />
        </BarChart>
      </ChartContainer>
    </div>
  );
}
