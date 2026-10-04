"use client";

import { useState } from "react";

import { useLocale, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  formatEnterpriseDate,
  formatUsd,
  type EnterpriseBillingSnapshot,
  type PlanInterval,
} from "@/lib/enterprise-api";

type Seat = EnterpriseBillingSnapshot["seats"][number];
type PendingInvoice = NonNullable<EnterpriseBillingSnapshot["pendingInvoice"]>;

const INTERVALS: PlanInterval[] = [1, 3, 6, 12];

/** A seat the current period does not pay for yet (§5A.7). */
function isUncovered(seat: Seat, periodEnd: string | null): boolean {
  if (!periodEnd || seat.excluded) return false;
  if (seat.planSource !== "enterprise" || !seat.planCurrentPeriodEnd) return true;
  return new Date(seat.planCurrentPeriodEnd) < new Date(periodEnd);
}

export function EnterpriseSeatsTable({
  seats,
  periodEnd,
  disabled,
  onAddSeat,
}: {
  seats: Seat[];
  periodEnd: string | null;
  disabled: boolean;
  onAddSeat: (userId: string) => void;
}) {
  const t = useTranslations("EnterpriseBilling");
  const locale = useLocale();
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("col_member")}</TableHead>
            <TableHead>{t("col_role")}</TableHead>
            <TableHead>{t("col_plan")}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {seats.map((s) => (
            <TableRow key={s.userId}>
              <TableCell className="text-sm">{s.userId}</TableCell>
              <TableCell>
                <span className="inline-flex flex-wrap items-center gap-1">
                  <Badge variant="outline">{s.seatRole === "business" ? t("role_business") : t("role_pro")}</Badge>
                  {s.excluded ? <Badge variant="secondary">{t(s.excluded)}</Badge> : null}
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground text-xs">
                {s.planId ?? "free"}
                {s.planCurrentPeriodEnd ? ` · ${formatEnterpriseDate(s.planCurrentPeriodEnd, locale)}` : ""}
              </TableCell>
              <TableCell className="text-right">
                {isUncovered(s, periodEnd) ? (
                  <Button size="sm" variant="outline" disabled={disabled} onClick={() => onAddSeat(s.userId)}>
                    {t("add_to_period")}
                  </Button>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function EnterprisePendingInvoice({
  invoice,
  busy,
  onContinue,
  onCancel,
}: {
  invoice: PendingInvoice;
  busy: boolean;
  onContinue: (orderId: number) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("EnterpriseBilling");
  const locale = useLocale();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/50 p-3">
      <div className="text-sm">
        <p className="font-medium">
          {t(invoice.kind === "seat" ? "pending_seat" : "pending_period", { amount: formatUsd(invoice.amountUsd) })}
        </p>
        <p className="text-muted-foreground text-xs">
          {t("pending_created", { date: formatEnterpriseDate(invoice.createdAt, locale), payer: invoice.payerUserId })}
        </p>
      </div>
      <div className="flex gap-2">
        {invoice.orderId ? (
          <Button size="sm" disabled={busy} onClick={() => onContinue(invoice.orderId ?? 0)}>
            {t("continue_payment")}
          </Button>
        ) : null}
        <Button size="sm" variant="outline" disabled={busy} onClick={onCancel}>
          {t("cancel_invoice")}
        </Button>
      </div>
    </div>
  );
}

export function EnterprisePeriodCheckout({
  quotes,
  canPay,
  hasPending,
  onCheckout,
}: {
  quotes: Record<string, number>;
  canPay: boolean;
  hasPending: boolean;
  onCheckout: (interval: PlanInterval) => void;
}) {
  const t = useTranslations("EnterpriseBilling");
  const [interval, setPlanInterval] = useState<PlanInterval>(1);
  const monthly = quotes["1"];
  const quote = quotes[String(interval)] as number | undefined;
  const discount = monthly && quote ? Math.max(0, Math.round((1 - quote / (monthly * interval)) * 100)) : 0;

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <p className="text-sm font-medium">{t("pay_period_title")}</p>
      <ToggleGroup
        type="single"
        variant="outline"
        value={String(interval)}
        onValueChange={(v) => (v ? setPlanInterval(Number(v) as PlanInterval) : undefined)}
      >
        {INTERVALS.map((n) => (
          <ToggleGroupItem key={n} value={String(n)}>
            {t("months", { n })}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          {quote == null ? "—" : <span className="text-lg font-semibold">{formatUsd(quote)}</span>}
          {discount > 0 ? (
            <span className="text-muted-foreground ml-2 text-xs">{t("discount", { percent: discount })}</span>
          ) : null}
        </p>
        <Button disabled={!canPay || hasPending || quote == null} onClick={() => onCheckout(interval)}>
          {t("pay_period")}
        </Button>
      </div>
      {hasPending ? <p className="text-muted-foreground text-xs">{t("pending_blocks_new")}</p> : null}
    </div>
  );
}
