"use client";

import type { ComponentProps } from "react";

import { Loader2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { EarningsPayoutTable, type EarningsPayoutTableVariant, type PayoutItem } from "./earnings-payout-table";

type TableLabels = ComponentProps<typeof EarningsPayoutTable>["labels"];

interface PayoutListCardProps {
  title: string;
  description?: string;
  isLoading: boolean;
  loadingLabel: string;
  emptyLabel: string;
  items: PayoutItem[];
  labels: TableLabels;
  variant?: EarningsPayoutTableVariant;
  onShowQr?: (item: PayoutItem) => void;
  minHeight?: "default" | "compact";
}

export function PayoutListCard({
  title,
  description,
  isLoading,
  loadingLabel,
  emptyLabel,
  items,
  labels,
  variant = "payable",
  onShowQr,
  minHeight = "default",
}: PayoutListCardProps) {
  const minH = minHeight === "compact" ? "min-h-[120px]" : "min-h-[200px]";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className={`text-muted-foreground flex ${minH} items-center justify-center`}>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            {loadingLabel}
          </div>
        ) : null}
        {!isLoading && items.length === 0 ? <p className="text-muted-foreground text-sm">{emptyLabel}</p> : null}
        {!isLoading && items.length > 0 ? (
          <EarningsPayoutTable items={items} variant={variant} labels={labels} onShowQr={onShowQr} />
        ) : null}
      </CardContent>
    </Card>
  );
}
