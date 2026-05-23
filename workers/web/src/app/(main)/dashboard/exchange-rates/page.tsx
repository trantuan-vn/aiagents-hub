"use client";

import { useCallback, useEffect, useState } from "react";

import { Save } from "lucide-react";
import { useTranslations } from "next-intl";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

interface ExchangeRateRow {
  rateDate: string;
  usdVndRate: number;
}

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ExchangeRatesPage() {
  const t = useTranslations("ExchangeRatesPage");
  const { toast } = useToast();
  const [items, setItems] = useState<ExchangeRateRow[]>([]);
  const [rateDate, setRateDate] = useState(todayLocal);
  const [usdVndRate, setUsdVndRate] = useState("26000");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/admin/exchange-rates/list`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      const data: { items?: ExchangeRateRow[] } = await res.json();
      setItems(data.items ?? []);
      const today = todayLocal();
      const todayRow = data.items?.find((r) => r.rateDate === today);
      if (todayRow) {
        setRateDate(today);
        setUsdVndRate(String(todayRow.usdVndRate));
      }
    } catch (e) {
      toast({
        title: t("error"),
        description: e instanceof Error ? e.message : t("load_error"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [t, toast]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const handleSave = async () => {
    const rate = Number(usdVndRate);
    if (!rateDate || !Number.isFinite(rate) || rate < 1) {
      toast({ title: t("error"), description: t("invalid_rate"), variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/admin/exchange-rates/daily`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rateDate, usdVndRate: rate }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: t("saved") });
      await fetchList();
    } catch (e) {
      toast({
        title: t("error"),
        description: e instanceof Error ? e.message : t("save_error"),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>

      <Alert>
        <AlertDescription>{t("hint")}</AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>{t("daily_form_title")}</CardTitle>
          <CardDescription>{t("daily_form_desc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="grid flex-1 gap-2">
            <Label htmlFor="rateDate">{t("date")}</Label>
            <Input id="rateDate" type="date" value={rateDate} onChange={(e) => setRateDate(e.target.value)} />
          </div>
          <div className="grid flex-1 gap-2">
            <Label htmlFor="usdVndRate">{t("rate_label")}</Label>
            <Input
              id="usdVndRate"
              type="number"
              min={1}
              value={usdVndRate}
              onChange={(e) => setUsdVndRate(e.target.value)}
            />
          </div>
          <Button onClick={() => void handleSave()} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? t("saving") : t("save")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("history_title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">{t("loading")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("date")}</TableHead>
                  <TableHead className="text-right">{t("rate_label")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => (
                  <TableRow key={row.rateDate}>
                    <TableCell>{row.rateDate}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(row.usdVndRate, { currency: "VND", locale: "vi-VN", noDecimals: true })}
                      <span className="text-muted-foreground ml-1 text-xs">/ USD</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
