"use client";

import { PayoutStatusBadge } from "@/app/(main)/dashboard/build/workflows/earnings/_components/payout-status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatUsd } from "@/lib/utils";

import type { CommissionClosedPeriodRow, CommissionMonthlySummary } from "../_lib/api";

interface CommissionClosedPeriodsCardProps {
  summary: CommissionMonthlySummary | null;
  closedPeriods: CommissionClosedPeriodRow[];
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

export function CommissionClosedPeriodsCard({
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
}: CommissionClosedPeriodsCardProps) {
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
                {formatUsd(summary?.closedTotalAmountUsd ?? 0)}
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
                      {formatUsd(row.totalAmountUsd)}
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
