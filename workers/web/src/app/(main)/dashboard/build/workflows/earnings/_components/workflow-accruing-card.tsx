"use client";

import { Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

import type { WorkflowEarningsMonthlySummary } from "../../_lib/api";

import { AccruingEarningsChart } from "./accruing-earnings-chart";
import { AccruingRoyaltiesTable } from "./accruing-royalties-table";

interface WorkflowAccruingCardProps {
  summary: WorkflowEarningsMonthlySummary | null;
  loading: boolean;
  title: string;
  accruingStatusLabel: string;
  description: string;
  accruingTotalLabel: string;
  noItemsLabel: string;
  tableTitle: string;
  workflowLabel: string;
  amountLabel: string;
  dateLabel: string;
}

function AccruingCardBody({
  loading,
  accruing,
  noItemsLabel,
  tableTitle,
  workflowLabel,
  amountLabel,
  dateLabel,
}: {
  loading: boolean;
  accruing: WorkflowEarningsMonthlySummary["accruing"] | undefined;
  noItemsLabel: string;
  tableTitle: string;
  workflowLabel: string;
  amountLabel: string;
  dateLabel: string;
}) {
  if (loading) return null;

  const byDay = accruing?.byDay ?? [];
  const royalties = accruing?.royalties ?? [];

  return (
    <>
      {byDay.length > 0 ? <AccruingEarningsChart byDay={byDay} /> : null}
      {royalties.length === 0 ? <p className="text-muted-foreground text-sm">{noItemsLabel}</p> : null}
      {royalties.length > 0 ? (
        <AccruingRoyaltiesTable
          royalties={royalties}
          tableTitle={tableTitle}
          workflowLabel={workflowLabel}
          amountLabel={amountLabel}
          dateLabel={dateLabel}
        />
      ) : null}
    </>
  );
}

export function WorkflowAccruingCard({
  summary,
  loading,
  title,
  accruingStatusLabel,
  description,
  accruingTotalLabel,
  noItemsLabel,
  tableTitle,
  workflowLabel,
  amountLabel,
  dateLabel,
}: WorkflowAccruingCardProps) {
  const accruing = summary?.accruing;
  const totalLabel = loading
    ? "..."
    : formatCurrency(accruing?.totalAmountVnd ?? 0, { currency: "VND", noDecimals: true });

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
          workflowLabel={workflowLabel}
          amountLabel={amountLabel}
          dateLabel={dateLabel}
        />
      </CardContent>
    </Card>
  );
}
