"use client";

import { CheckCircle2, Loader2, QrCode } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";

export interface PayoutItem {
  recipientUserId: string;
  recipientIdentifier: string;
  commissionAmountVnd: number;
  workflowRoyaltyAmountVnd: number;
  totalAmountVnd: number;
  status: "pending" | "paid";
  paidAt?: string;
  hasBeneficiary: boolean;
}

interface EarningsPayoutTableProps {
  items: PayoutItem[];
  markingId: string | null;
  labels: {
    user: string;
    commission: string;
    workflow: string;
    total: string;
    beneficiary: string;
    status: string;
    actions: string;
    configured: string;
    missing: string;
    paid: string;
    pending: string;
    show_qr: string;
    mark_paid: string;
  };
  onShowQr: (item: PayoutItem) => void;
  onMarkPaid: (item: PayoutItem) => void;
}

export function EarningsPayoutTable({
  items,
  markingId,
  labels,
  onShowQr,
  onMarkPaid,
}: EarningsPayoutTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{labels.user}</TableHead>
          <TableHead className="text-right">{labels.commission}</TableHead>
          <TableHead className="text-right">{labels.workflow}</TableHead>
          <TableHead className="text-right">{labels.total}</TableHead>
          <TableHead>{labels.beneficiary}</TableHead>
          <TableHead>{labels.status}</TableHead>
          <TableHead className="text-right">{labels.actions}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.recipientUserId}>
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
            <TableCell>
              {item.hasBeneficiary ? (
                <Badge variant="secondary">{labels.configured}</Badge>
              ) : (
                <Badge variant="outline">{labels.missing}</Badge>
              )}
            </TableCell>
            <TableCell>
              {item.status === "paid" ? (
                <Badge className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  {labels.paid}
                </Badge>
              ) : (
                <Badge variant="outline">{labels.pending}</Badge>
              )}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!item.hasBeneficiary || item.status === "paid"}
                  onClick={() => onShowQr(item)}
                >
                  <QrCode className="mr-1 h-4 w-4" />
                  {labels.show_qr}
                </Button>
                <Button
                  size="sm"
                  disabled={item.status === "paid" || markingId === item.recipientUserId}
                  onClick={() => onMarkPaid(item)}
                >
                  {markingId === item.recipientUserId ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    labels.mark_paid
                  )}
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
