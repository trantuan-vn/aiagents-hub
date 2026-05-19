"use client";

import { useCallback, useEffect, useState } from "react";

import { Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { getEarningsStats, listEarnings } from "../_lib/api";

export default function WorkflowEarningsPage() {
  const t = useTranslations("WorkflowEarningsPage");
  const [period, setPeriod] = useState(30);
  const [total, setTotal] = useState(0);
  const [byDay, setByDay] = useState<{ date: string; total: number }[]>([]);
  const [royalties, setRoyalties] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [stats, list] = await Promise.all([getEarningsStats(period), listEarnings(period)]);
      setTotal(stats.totalAmount);
      setByDay(stats.byDay);
      setRoyalties(list.royalties);
    } catch {
      toast.error(t("load_error"));
    } finally {
      setLoading(false);
    }
  }, [period, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div className="flex items-start gap-3">
        <div className="bg-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
          <Wallet className="text-muted-foreground h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t("description")}</p>
        </div>
      </div>

      <div className="flex gap-2">
        {[7, 30, 90].map((d) => (
          <Button key={d} size="sm" variant={period === d ? "default" : "outline"} onClick={() => setPeriod(d)}>
            {d === 7 ? t("period_7") : d === 30 ? t("period_30") : t("period_90")}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("total")}</CardTitle>
          <CardDescription>{loading ? "..." : total.toLocaleString()} VND</CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("chart_title")}</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byDay}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("table_title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2">{t("workflow")}</th>
                  <th className="pb-2">{t("amount")}</th>
                  <th className="pb-2">{t("date")}</th>
                </tr>
              </thead>
              <tbody>
                {royalties.map((r) => (
                  <tr
                    key={String(r.globalId ?? r.id ?? r.created_at ?? JSON.stringify(r))}
                    className="border-muted/50 border-b"
                  >
                    <td className="py-2">{String(r.workflowId ?? "")}</td>
                    <td className="py-2">{Number(r.royaltyAmountVnd ?? 0).toLocaleString()}</td>
                    <td className="text-muted-foreground py-2">
                      {r.created_at ? new Date(Number(r.created_at)).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
