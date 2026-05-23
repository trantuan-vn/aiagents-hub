"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";

import type { WorkflowClosedPeriodRow, WorkflowEarningsMonthlySummary } from "../../_lib/api";

import { PayoutStatusBadge } from "./payout-status-badge";

interface WorkflowClosedPeriodsCardProps {
  summary: WorkflowEarningsMonthlySummary | null;
  closedPeriods: WorkflowClosedPeriodRow[];
  loading: boolean;
  title: string;
  description: string;
  loadingLabel: string;
  noItemsLabel: string;
  closedTotalLabel: string;
  periodLabel: string;
  amountLabel: string;
  payoutStatusLabel: string;
  payoutLabels: { pending: string; paid: string; not_scheduled: string };
}

export function WorkflowClosedPeriodsCard({
  summary,
  closedPeriods,
  loading,
  title,
  description,
  loadingLabel,
  noItemsLabel,
  closedTotalLabel,
  periodLabel,
  amountLabel,
  payoutStatusLabel,
  payoutLabels,
}: WorkflowClosedPeriodsCardProps) {
  const hasRows = !loading && closedPeriods.length > 0;
  const showEmpty = !loading && closedPeriods.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? <p className="text-muted-foreground text-sm">{loadingLabel}</p> : null}
        {showEmpty ? <p className="text-muted-foreground text-sm">{noItemsLabel}</p> : null}
        {hasRows ? (
          <>
            <p className="text-muted-foreground mb-4 text-sm">
              {closedTotalLabel}:{" "}
              <span className="text-foreground font-medium">
                {formatCurrency(summary?.closedTotalAmountUsd ?? 0, {
                  currency: "VND",
                  noDecimals: true,
                })}
              </span>
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{periodLabel}</TableHead>
                  <TableHead className="text-right">{amountLabel}</TableHead>
                  <TableHead>{payoutStatusLabel}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {closedPeriods.map((row) => (
                  <TableRow key={row.period}>
                    <TableCell className="font-mono text-sm">{row.period}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(row.totalAmountUsd, { currency: "USD", maximumFractionDigits: 4 })}
                    </TableCell>
                    <TableCell>
                      <PayoutStatusBadge status={row.payoutStatus} labels={payoutLabels} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
