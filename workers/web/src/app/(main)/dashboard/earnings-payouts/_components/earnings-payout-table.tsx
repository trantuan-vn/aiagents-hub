"use client";

import { Fragment, useState } from "react";

import { CheckCircle2, ChevronDown, ChevronRight, QrCode } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";

export interface PayoutPeriodRow {
  period: string;
  commissionAmountVnd: number;
  workflowRoyaltyAmountVnd: number;
  totalAmountVnd: number;
  bankStatus: "paid" | "unpaid";
  paidAt?: string;
}

export interface PayoutItem {
  recipientUserId: string;
  recipientIdentifier: string;
  commissionAmountVnd: number;
  workflowRoyaltyAmountVnd: number;
  totalAmountVnd: number;
  bankStatus: "paid" | "unpaid";
  hasBeneficiary: boolean;
  periods: PayoutPeriodRow[];
}

interface EarningsPayoutTableProps {
  items: PayoutItem[];
  labels: {
    user: string;
    period: string;
    commission: string;
    workflow: string;
    total: string;
    beneficiary: string;
    bank_status: string;
    actions: string;
    configured: string;
    missing: string;
    bank_paid: string;
    bank_unpaid: string;
    show_qr: string;
  };
  onShowQr: (item: PayoutItem) => void;
}

export function EarningsPayoutTable({ items, labels, onShowQr }: EarningsPayoutTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (userId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8" />
          <TableHead>{labels.user}</TableHead>
          <TableHead className="text-right">{labels.commission}</TableHead>
          <TableHead className="text-right">{labels.workflow}</TableHead>
          <TableHead className="text-right">{labels.total}</TableHead>
          <TableHead>{labels.beneficiary}</TableHead>
          <TableHead>{labels.bank_status}</TableHead>
          <TableHead className="text-right">{labels.actions}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => {
          const isOpen = expanded.has(item.recipientUserId);
          return (
            <Fragment key={item.recipientUserId}>
              <TableRow
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => toggle(item.recipientUserId)}
              >
                <TableCell>
                  {isOpen ? (
                    <ChevronDown className="text-muted-foreground h-4 w-4" />
                  ) : (
                    <ChevronRight className="text-muted-foreground h-4 w-4" />
                  )}
                </TableCell>
                <TableCell className="font-mono text-sm">{item.recipientIdentifier}</TableCell>
                <TableCell className="text-right">
                  {formatCurrency(item.commissionAmountVnd, { currency: "VND", noDecimals: true })}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(item.workflowRoyaltyAmountVnd, { currency: "VND", noDecimals: true })}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(item.totalAmountVnd, { currency: "VND", noDecimals: true })}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  {item.hasBeneficiary ? (
                    <Badge variant="secondary">{labels.configured}</Badge>
                  ) : (
                    <Badge variant="outline">{labels.missing}</Badge>
                  )}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <BankStatusBadge
                    status={item.bankStatus}
                    paidLabel={labels.bank_paid}
                    unpaidLabel={labels.bank_unpaid}
                  />
                </TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!item.hasBeneficiary}
                    onClick={() => onShowQr(item)}
                  >
                    <QrCode className="mr-1 h-4 w-4" />
                    {labels.show_qr}
                  </Button>
                </TableCell>
              </TableRow>
              {isOpen &&
                item.periods.map((p) => (
                  <TableRow key={`${item.recipientUserId}-${p.period}`} className="bg-muted/30">
                    <TableCell />
                    <TableCell className="text-muted-foreground pl-6 text-sm">{p.period}</TableCell>
                    <TableCell className="text-right text-sm">
                      {formatCurrency(p.commissionAmountVnd, { currency: "VND", noDecimals: true })}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {formatCurrency(p.workflowRoyaltyAmountVnd, { currency: "VND", noDecimals: true })}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {formatCurrency(p.totalAmountVnd, { currency: "VND", noDecimals: true })}
                    </TableCell>
                    <TableCell />
                    <TableCell>
                      <BankStatusBadge
                        status={p.bankStatus}
                        paidLabel={labels.bank_paid}
                        unpaidLabel={labels.bank_unpaid}
                      />
                    </TableCell>
                    <TableCell />
                  </TableRow>
                ))}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}

function BankStatusBadge({
  status,
  paidLabel,
  unpaidLabel,
}: {
  status: "paid" | "unpaid";
  paidLabel: string;
  unpaidLabel: string;
}) {
  if (status === "paid") {
    return (
      <Badge className="gap-1">
        <CheckCircle2 className="h-3 w-3" />
        {paidLabel}
      </Badge>
    );
  }
  return <Badge variant="outline">{unpaidLabel}</Badge>;
}
