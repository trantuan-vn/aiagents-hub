"use client";

import { Clock } from "lucide-react";

import { AccruingEarningsChart } from "@/app/(main)/dashboard/build/workflows/earnings/_components/accruing-earnings-chart";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

import type { CommissionMonthlySummary } from "../_lib/api";

import { AccruingCommissionsTable } from "./accruing-commissions-table";

interface CommissionAccruingCardProps {
  summary: CommissionMonthlySummary | null;
  loading: boolean;
  title: string;
  accruingStatusLabel: string;
  description: string;
  accruingTotalLabel: string;
  noItemsLabel: string;
  tableTitle: string;
  timeLabel: string;
  referredUserLabel: string;
  orderValueLabel: string;
  commissionPercentLabel: string;
  commissionAmountLabel: string;
}

function AccruingCardBody({
  loading,
  accruing,
  noItemsLabel,
  tableTitle,
  timeLabel,
  referredUserLabel,
  orderValueLabel,
  commissionPercentLabel,
  commissionAmountLabel,
}: {
  loading: boolean;
  accruing: CommissionMonthlySummary["accruing"] | undefined;
  noItemsLabel: string;
  tableTitle: string;
  timeLabel: string;
  referredUserLabel: string;
  orderValueLabel: string;
  commissionPercentLabel: string;
  commissionAmountLabel: string;
}) {
  if (loading) return null;

  const byDay = accruing?.byDay ?? [];
  const commissions = accruing?.commissions ?? [];

  return (
    <>
      {byDay.length > 0 ? <AccruingEarningsChart byDay={byDay} /> : null}
      {commissions.length === 0 ? <p className="text-muted-foreground text-sm">{noItemsLabel}</p> : null}
      {commissions.length > 0 ? (
        <AccruingCommissionsTable
          commissions={commissions}
          tableTitle={tableTitle}
          timeLabel={timeLabel}
          referredUserLabel={referredUserLabel}
          orderValueLabel={orderValueLabel}
          commissionPercentLabel={commissionPercentLabel}
          commissionAmountLabel={commissionAmountLabel}
        />
      ) : null}
    </>
  );
}

export function CommissionAccruingCard({
  summary,
  loading,
  title,
  accruingStatusLabel,
  description,
  accruingTotalLabel,
  noItemsLabel,
  tableTitle,
  timeLabel,
  referredUserLabel,
  orderValueLabel,
  commissionPercentLabel,
  commissionAmountLabel,
}: CommissionAccruingCardProps) {
  const accruing = summary?.accruing;
  const totalLabel = loading
    ? "..."
    : formatCurrency(accruing?.totalAmountUsd ?? 0, { currency: "USD", maximumFractionDigits: 4 });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {title}
          <Badge variant="secondary" className="gap-1 font-normal">
            <Clock className="h-3 w-3" />
            {accruingStatusLabel}
          </Badge>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-muted-foreground text-xs">{accruingTotalLabel}</p>
          <p className="text-2xl font-bold">{totalLabel}</p>
        </div>
        <AccruingCardBody
          loading={loading}
          accruing={accruing}
          noItemsLabel={noItemsLabel}
          tableTitle={tableTitle}
          timeLabel={timeLabel}
          referredUserLabel={referredUserLabel}
          orderValueLabel={orderValueLabel}
          commissionPercentLabel={commissionPercentLabel}
          commissionAmountLabel={commissionAmountLabel}
        />
      </CardContent>
    </Card>
  );
}
