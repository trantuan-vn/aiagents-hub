"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatUsd } from "@/lib/utils";

import type { AdminFinanceStats } from "../page";

interface FinanceDataTablesProps {
  stats: AdminFinanceStats;
}

function getStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "COMPLETED":
      return "default";
    case "PENDING":
      return "secondary";
    case "CANCELLED":
      return "destructive";
    case "CONFIRMED":
    case "PROCESSING":
      return "outline";
    default:
      return "outline";
  }
}

export function FinanceDataTables({ stats }: FinanceDataTablesProps) {
  const t = useTranslations("FinanceAdmin");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("recent_orders")}</CardTitle>
        <CardDescription>{t("recent_orders_desc")}</CardDescription>
      </CardHeader>
      <CardContent>
        {stats.recentOrders.length > 0 ? (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("order_code")}</TableHead>
                  <TableHead>{t("amount")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead>{t("date")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.recentOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono font-medium">{order.orderCode}</TableCell>
                    <TableCell className="tabular-nums">
                      {formatUsd(order.finalAmount)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(order.status)}>
                        {t(`status_${order.status.toLowerCase()}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{order.createdAt}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-muted-foreground flex min-h-[120px] items-center justify-center rounded-lg border border-dashed py-8">
            {t("no_data")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
