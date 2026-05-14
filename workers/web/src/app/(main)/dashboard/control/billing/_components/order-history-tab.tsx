"use client";

import { AlertCircle, Calendar, Filter } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { OrderList } from "./order-list";
import type { Order } from "./schema";

export type DatePreset = "all" | "7d" | "30d" | "month" | "custom";

export function getPresetDateRange(preset: Exclude<DatePreset, "all" | "custom">): {
  fromDate: string;
  toDate: string;
} {
  const today = new Date();
  const toDate = today.toISOString().slice(0, 10);
  let fromDate: string;

  switch (preset) {
    case "7d": {
      const d = new Date(today);
      d.setDate(d.getDate() - 7);
      fromDate = d.toISOString().slice(0, 10);
      break;
    }
    case "30d": {
      const d = new Date(today);
      d.setDate(d.getDate() - 30);
      fromDate = d.toISOString().slice(0, 10);
      break;
    }
    case "month": {
      fromDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
      break;
    }
    default:
      fromDate = toDate;
  }
  return { fromDate, toDate };
}

interface OrderHistoryTabProps {
  preset: DatePreset;
  fromDate: string;
  toDate: string;
  onPresetChange: (v: DatePreset) => void;
  onFromDateChange: (v: string) => void;
  onToDateChange: (v: string) => void;
  onApply: (dateParams?: { fromDate: string; toDate: string }) => void;
  orders: Order[];
  loading: boolean;
  error: string | null;
  onCancel: (orderId: number) => Promise<void>;
  onPayment: (orderId: number, amount: number, bankCode: string, language: string) => Promise<void>;
  onCassoQr: (orderId: number, amount: number) => Promise<{ qr: string }>;
  onPaidDone?: () => void;
  t: (key: string) => string;
}

export function OrderHistoryTab({
  preset,
  fromDate,
  toDate,
  onPresetChange,
  onFromDateChange,
  onToDateChange,
  onApply,
  orders,
  loading,
  error,
  onCancel,
  onPayment,
  onCassoQr,
  onPaidDone,
  t,
}: OrderHistoryTabProps) {
  const handlePresetChange = (v: DatePreset) => {
    onPresetChange(v);
    if (v === "all") {
      void onApply(undefined);
    } else if (v === "custom") {
      // Pre-fill và auto-apply 7 ngày gần nhất
      const range = getPresetDateRange("7d");
      onFromDateChange(range.fromDate);
      onToDateChange(range.toDate);
      void onApply(range);
    } else {
      const range = getPresetDateRange(v);
      void onApply(range);
    }
  };

  const handleApply = () => {
    if (preset === "custom" && fromDate && toDate) {
      void onApply({ fromDate, toDate });
    }
  };

  const canApply = preset === "custom" && !!fromDate && !!toDate;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" />
            {t("filters.title")}
          </CardTitle>
          <CardDescription>{t("filters.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
            <Select value={preset} onValueChange={(v: DatePreset) => handlePresetChange(v)}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder={t("filters.preset_placeholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("filters.preset_all")}</SelectItem>
                <SelectItem value="7d">{t("filters.preset_7d")}</SelectItem>
                <SelectItem value="30d">{t("filters.preset_30d")}</SelectItem>
                <SelectItem value="month">{t("filters.preset_month")}</SelectItem>
                <SelectItem value="custom">{t("filters.preset_custom")}</SelectItem>
              </SelectContent>
            </Select>

            {preset === "custom" && (
              <div className="flex flex-1 flex-wrap items-center gap-2">
                <Calendar className="text-muted-foreground hidden h-4 w-4 sm:block" />
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(e) => onFromDateChange(e.target.value)}
                  className="w-full sm:w-[140px]"
                />
                <span className="text-muted-foreground text-sm">–</span>
                <Input
                  type="date"
                  value={toDate}
                  onChange={(e) => onToDateChange(e.target.value)}
                  className="w-full sm:w-[140px]"
                />
              </div>
            )}

            {preset === "custom" && (
              <Button onClick={handleApply} size="sm" disabled={!canApply}>
                {t("filters.apply")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t("error")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">{t("loading")}</p>
          </CardContent>
        </Card>
      ) : (
        <OrderList
          orders={orders}
          onCancel={onCancel}
          onPayment={onPayment}
          onCassoQr={onCassoQr}
          onPaidDone={onPaidDone}
          readOnly
        />
      )}
    </>
  );
}
