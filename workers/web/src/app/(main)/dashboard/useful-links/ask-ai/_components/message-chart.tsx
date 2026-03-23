"use client";

import * as React from "react";

import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis } from "recharts";

import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.unitoken.trade";

interface ChartPayload {
  chartType?: "line" | "bar" | "pie";
  endpoint?: string;
  dataKey?: string;
  nameKey?: string;
  /** Đường dẫn đến mảng trong response (vd: "revenueByDay", "visitorsByDate") */
  dataPath?: string;
  data?: Array<Record<string, unknown>>;
}

const CHART_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

export function MessageChart({ payload }: { payload: ChartPayload }) {
  const [data, setData] = React.useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function load() {
      if (payload.data && Array.isArray(payload.data)) {
        setData(payload.data);
        setLoading(false);
        return;
      }
      if (!payload.endpoint) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`${API_BASE_URL}${payload.endpoint}`, { credentials: "include" });
        const json = (await res.json()) as Record<string, unknown> & { error?: string };
        if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed");
        let rawItems: unknown[];
        if (Array.isArray(json)) {
          rawItems = json;
        } else if (payload.dataPath && typeof (json as Record<string, unknown>)[payload.dataPath] === "object") {
          const arr = (json as Record<string, unknown>)[payload.dataPath];
          rawItems = Array.isArray(arr) ? arr : [];
        } else {
          rawItems = (json.data ?? json.items ?? []) as unknown[];
        }
        const items: Array<Record<string, unknown>> = Array.isArray(rawItems)
          ? rawItems.filter((r): r is Record<string, unknown> => r != null && typeof r === "object" && !Array.isArray(r))
          : [];
        setData(items);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [payload.endpoint, payload.data, payload.dataPath]);

  const chartType = payload.chartType ?? "bar";
  const dataKey = payload.dataKey ?? "value";
  const nameKey = payload.nameKey ?? "name";

  const chartConfig = React.useMemo(
    () =>
      ({
        value: { label: "Value", color: CHART_COLORS[0] },
        [dataKey]: { label: String(dataKey), color: CHART_COLORS[0] },
        [nameKey]: { label: String(nameKey), color: CHART_COLORS[1] },
      }) satisfies ChartConfig,
    [dataKey, nameKey],
  );

  if (loading) return <div className="text-muted-foreground py-4 text-sm">Đang tải biểu đồ...</div>;
  if (error) return <p className="text-destructive text-sm">{error}</p>;
  if (data.length === 0) return <p className="text-muted-foreground py-4 text-sm">Không có dữ liệu</p>;

  return (
    <div className="bg-card rounded-lg border p-4">
      <ChartContainer config={chartConfig} className="h-[240px] w-full">
        {chartType === "pie" ? (
          <PieChart data={data}>
            <ChartTooltip content={<ChartTooltipContent />} />
            <Pie dataKey={dataKey} nameKey={nameKey} cx="50%" cy="50%" outerRadius={80}>
              {data.map((row, i) => (
                <Cell key={String(row[nameKey] ?? i)} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        ) : chartType === "line" ? (
          <LineChart data={data} margin={{ left: 0, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={nameKey} />
            <YAxis />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line type="monotone" dataKey={dataKey} stroke={`var(--color-${dataKey})`} strokeWidth={2} />
          </LineChart>
        ) : (
          <BarChart data={data} margin={{ left: 0, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={nameKey} />
            <YAxis />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey={dataKey} fill={`var(--color-${dataKey})`} radius={[4, 4, 0, 0]} />
          </BarChart>
        )}
      </ChartContainer>
    </div>
  );
}
