"use client";

import { Fragment, useState } from "react";

import { CheckCircle2, ChevronDown, ChevronRight, Clock, DollarSign, QrCode } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";

export interface PayoutPeriodRow {
  period: string;
  commissionAmountUsd: number;
  workflowRoyaltyAmountUsd: number;
  totalAmountUsd: number;
  bankStatus: "paid" | "unpaid";
  paidAt?: string;
}

export interface PayoutItem {
  recipientUserId: string;
  recipientIdentifier: string;
  commissionAmountUsd: number;
  workflowRoyaltyAmountUsd: number;
  totalAmountUsd: number;
  bankStatus: "paid" | "unpaid";
  hasBeneficiary: boolean;
  earningsPayoutCurrency: "VND" | "USD";
  periods: PayoutPeriodRow[];
}

export type EarningsPayoutTableVariant = "payable" | "accruing";

interface TableLabels {
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
  pay_usd_coming_soon: string;
  payout_currency: string;
  accruing_status?: string;
}

interface EarningsPayoutTableProps {
  items: PayoutItem[];
  variant?: EarningsPayoutTableVariant;
  labels: TableLabels;
  onShowQr?: (item: PayoutItem) => void;
}

const fmtUsd = (n: number) => formatCurrency(n, { currency: "USD", maximumFractionDigits: 4 });

function canShowVietQr(item: PayoutItem): boolean {
  return item.earningsPayoutCurrency === "VND" && item.hasBeneficiary && item.bankStatus !== "paid";
}

function PayoutActionsCell({
  item,
  labels,
  onShowQr,
}: {
  item: PayoutItem;
  labels: TableLabels;
  onShowQr?: (item: PayoutItem) => void;
}) {
  const vietQrEnabled = canShowVietQr(item);
  return (
    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="outline" disabled={!vietQrEnabled} onClick={() => onShowQr?.(item)}>
          <QrCode className="mr-1 h-4 w-4" />
          {labels.show_qr}
        </Button>
        <Button size="sm" variant="outline" disabled>
          <DollarSign className="mr-1 h-4 w-4" />
          {labels.pay_usd_coming_soon}
        </Button>
      </div>
    </TableCell>
  );
}

function ExpandToggleCell({ isOpen }: { isOpen: boolean }) {
  const Icon = isOpen ? ChevronDown : ChevronRight;
  return (
    <TableCell>
      <Icon className="text-muted-foreground h-4 w-4" />
    </TableCell>
  );
}

function PayoutCurrencyCell({ currency }: { currency: "VND" | "USD" }) {
  return (
    <TableCell onClick={(e) => e.stopPropagation()}>
      <Badge variant="outline">{currency}</Badge>
    </TableCell>
  );
}

function BeneficiaryCell({ hasBeneficiary, labels }: { hasBeneficiary: boolean; labels: TableLabels }) {
  return (
    <TableCell onClick={(e) => e.stopPropagation()}>
      {hasBeneficiary ? (
        <Badge variant="secondary">{labels.configured}</Badge>
      ) : (
        <Badge variant="outline">{labels.missing}</Badge>
      )}
    </TableCell>
  );
}

function PayoutStatusCell({
  isAccruing,
  bankStatus,
  labels,
}: {
  isAccruing: boolean;
  bankStatus: "paid" | "unpaid";
  labels: TableLabels;
}) {
  return (
    <TableCell onClick={(e) => e.stopPropagation()}>
      {isAccruing ? (
        <AccruingBadge label={labels.accruing_status ?? ""} />
      ) : (
        <BankStatusBadge status={bankStatus} paidLabel={labels.bank_paid} unpaidLabel={labels.bank_unpaid} />
      )}
    </TableCell>
  );
}

function PayoutItemRows({
  item,
  isAccruing,
  isOpen,
  labels,
  onToggle,
  onShowQr,
}: {
  item: PayoutItem;
  isAccruing: boolean;
  isOpen: boolean;
  labels: TableLabels;
  onToggle: () => void;
  onShowQr?: (item: PayoutItem) => void;
}) {
  return (
    <Fragment>
      <TableRow className="hover:bg-muted/50 cursor-pointer" onClick={onToggle}>
        <ExpandToggleCell isOpen={isOpen} />
        <TableCell className="font-mono text-sm">{item.recipientIdentifier}</TableCell>
        <TableCell className="text-right">{fmtUsd(item.commissionAmountUsd)}</TableCell>
        <TableCell className="text-right">{fmtUsd(item.workflowRoyaltyAmountUsd)}</TableCell>
        <TableCell className="text-right font-medium">{fmtUsd(item.totalAmountUsd)}</TableCell>
        {!isAccruing && <PayoutCurrencyCell currency={item.earningsPayoutCurrency} />}
        {!isAccruing && <BeneficiaryCell hasBeneficiary={item.hasBeneficiary} labels={labels} />}
        <PayoutStatusCell isAccruing={isAccruing} bankStatus={item.bankStatus} labels={labels} />
        {!isAccruing && <PayoutActionsCell item={item} labels={labels} onShowQr={onShowQr} />}
      </TableRow>
      {isOpen
        ? item.periods.map((p) => (
            <PayoutPeriodRow
              key={`${item.recipientUserId}-${p.period}`}
              period={p}
              isAccruing={isAccruing}
              labels={labels}
            />
          ))
        : null}
    </Fragment>
  );
}

function PayoutPeriodRow({
  period,
  isAccruing,
  labels,
}: {
  period: PayoutPeriodRow;
  isAccruing: boolean;
  labels: TableLabels;
}) {
  return (
    <TableRow className="bg-muted/30">
      <TableCell />
      <TableCell className="text-muted-foreground pl-6 text-sm">{period.period}</TableCell>
      <TableCell className="text-right text-sm">{fmtUsd(period.commissionAmountUsd)}</TableCell>
      <TableCell className="text-right text-sm">{fmtUsd(period.workflowRoyaltyAmountUsd)}</TableCell>
      <TableCell className="text-right text-sm">{fmtUsd(period.totalAmountUsd)}</TableCell>
      {!isAccruing && <TableCell />}
      {!isAccruing && <TableCell />}
      <PayoutStatusCell isAccruing={isAccruing} bankStatus={period.bankStatus} labels={labels} />
      {!isAccruing && <TableCell />}
    </TableRow>
  );
}

export function EarningsPayoutTable({ items, variant = "payable", labels, onShowQr }: EarningsPayoutTableProps) {
  const isAccruing = variant === "accruing";
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
          {!isAccruing && <TableHead>{labels.payout_currency}</TableHead>}
          {!isAccruing && <TableHead>{labels.beneficiary}</TableHead>}
          <TableHead>{isAccruing ? (labels.accruing_status ?? labels.bank_status) : labels.bank_status}</TableHead>
          {!isAccruing && <TableHead className="text-right">{labels.actions}</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <PayoutItemRows
            key={item.recipientUserId}
            item={item}
            isAccruing={isAccruing}
            isOpen={expanded.has(item.recipientUserId)}
            labels={labels}
            onToggle={() => {
              toggle(item.recipientUserId);
            }}
            onShowQr={onShowQr}
          />
        ))}
      </TableBody>
    </Table>
  );
}

function AccruingBadge({ label }: { label: string }) {
  return (
    <Badge variant="secondary" className="gap-1">
      <Clock className="h-3 w-3" />
      {label}
    </Badge>
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
