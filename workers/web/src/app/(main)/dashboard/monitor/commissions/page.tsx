"use client";

import { useCallback, useEffect, useState } from "react";

import { TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

interface CommissionRow {
  id?: number;
  orderCode: string;
  referredUserId: string;
  orderAmount: number;
  commissionPercent: number;
  commissionAmount: number;
  currency: string;
  created_at?: number;
}

export default function CommissionsPage() {
  const t = useTranslations("CommissionsPage");
  const [period, setPeriod] = useState("30");
  const [stats, setStats] = useState<{ byDay: { date: string; total: number }[]; totalAmount: number } | null>(null);
  const [commissions, setCommissions] = useState<CommissionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [statsRes, listRes] = await Promise.all([
        fetch(`${API_BASE_URL}/dashboard/referral/commissions/stats?period=${period}`, {
          credentials: "include",
        }),
        fetch(`${API_BASE_URL}/dashboard/referral/commissions?period=${period}&limit=50`, {
          credentials: "include",
        }),
      ]);
      if (statsRes.ok) {
        const d: { byDay?: { date: string; total: number }[]; totalAmount?: number } = await statsRes.json();
        setStats({ byDay: d.byDay ?? [], totalAmount: d.totalAmount ?? 0 });
      }
      if (listRes.ok) {
        const d: { commissions?: CommissionRow[] } = await listRes.json();
        setCommissions(d.commissions ?? []);
      }
    } catch {
      setStats(null);
      setCommissions([]);
    } finally {
      setIsLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const chartData = (stats?.byDay ?? []).map((d) => ({ date: d.date, total: d.total }));

  const chartConfig = {
    total: { label: "Commission", color: "hsl(var(--chart-1))" },
  } satisfies ChartConfig;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              {t("chart_title")}
            </CardTitle>
            <CardDescription>{t("chart_description")}</CardDescription>
            <div className="pt-2">
              <ToggleGroup
                type="single"
                value={period}
                onValueChange={(v) => v && setPeriod(v)}
                variant="outline"
                size="sm"
              >
                <ToggleGroupItem value="7">{t("filter_7d")}</ToggleGroupItem>
                <ToggleGroupItem value="30">{t("filter_30d")}</ToggleGroupItem>
                <ToggleGroupItem value="90">{t("filter_90d")}</ToggleGroupItem>
              </ToggleGroup>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground py-8 text-center">{t("loading")}</p>
            ) : chartData.length > 0 ? (
              <ChartContainer config={chartConfig} className="h-[200px] w-full">
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="var(--chart-1)"
                    fill="var(--chart-1)"
                    fillOpacity={0.3}
                  />
                </AreaChart>
              </ChartContainer>
            ) : (
              <p className="text-muted-foreground py-8 text-center">{t("no_data")}</p>
            )}
            {stats && (
              <p className="text-muted-foreground mt-4 text-sm">
                {t("total_amount")}: {stats.totalAmount.toLocaleString()} VND
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("table_title")}</CardTitle>
            <CardDescription>{t("table_description")}</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground py-8 text-center">{t("loading")}</p>
            ) : commissions.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center">{t("no_commissions")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("time")}</TableHead>
                    <TableHead>{t("referred_user")}</TableHead>
                    <TableHead>{t("order_value")}</TableHead>
                    <TableHead>{t("commission_percent")}</TableHead>
                    <TableHead>{t("commission_amount")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {commissions.map((c, i) => (
                    <TableRow key={c.id ?? i}>
                      <TableCell>{c.created_at ? new Date(c.created_at).toLocaleString() : "-"}</TableCell>
                      <TableCell className="font-mono text-sm whitespace-nowrap">{c.referredUserId ?? "-"}</TableCell>
                      <TableCell>
                        {c.orderAmount.toLocaleString()} {c.currency}
                      </TableCell>
                      <TableCell>{c.commissionPercent}%</TableCell>
                      <TableCell>
                        {c.commissionAmount.toLocaleString()} {c.currency}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
