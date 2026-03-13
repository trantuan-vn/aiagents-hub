"use client";

import { CreditCard, Package, Receipt } from "lucide-react";
import { useTranslations } from "next-intl";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface BillingStatsCardsProps {
  totalOrders: number;
  pendingOrders: number;
  totalAmount: number;
}

export function BillingStatsCards({ totalOrders, pendingOrders, totalAmount }: BillingStatsCardsProps) {
  const t = useTranslations("BillingPage");
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t("stats.total_orders")}</CardTitle>
          <Package className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalOrders}</div>
          <p className="text-muted-foreground text-xs">{t("stats.total_orders_description")}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t("stats.pending_orders")}</CardTitle>
          <Receipt className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{pendingOrders}</div>
          <p className="text-muted-foreground text-xs">{t("stats.pending_orders_description")}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t("stats.total_amount")}</CardTitle>
          <CreditCard className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(totalAmount)}
          </div>
          <p className="text-muted-foreground text-xs">{t("stats.total_amount_description")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
