"use client";

import { formatCurrency } from "@/lib/utils";

function commissionRowKey(c: Record<string, unknown>, index: number): string {
  return String(c.id ?? c.globalId ?? c.created_at ?? index);
}

function CommissionRow({ commission }: { commission: Record<string, unknown> }) {
  const currency = String(commission.currency ?? "VND");
  const createdAt = commission.created_at ? new Date(Number(commission.created_at)).toLocaleString() : "—";

  return (
    <tr className="border-muted/50 border-b">
      <td className="text-muted-foreground py-2">{createdAt}</td>
      <td className="py-2 font-mono text-xs">{String(commission.referredUserId ?? "—")}</td>
      <td className="py-2">
        {formatCurrency(Number(commission.orderAmount ?? 0), { currency, noDecimals: true })}
      </td>
      <td className="py-2">{String(commission.commissionPercent ?? "—")}%</td>
      <td className="py-2">
        {formatCurrency(Number(commission.commissionAmount ?? 0), { currency, noDecimals: true })}
      </td>
    </tr>
  );
}

interface AccruingCommissionsTableProps {
  commissions: Record<string, unknown>[];
  tableTitle: string;
  timeLabel: string;
  referredUserLabel: string;
  orderValueLabel: string;
  commissionPercentLabel: string;
  commissionAmountLabel: string;
}

export function AccruingCommissionsTable({
  commissions,
  tableTitle,
  timeLabel,
  referredUserLabel,
  orderValueLabel,
  commissionPercentLabel,
  commissionAmountLabel,
}: AccruingCommissionsTableProps) {
  return (
    <div className="overflow-x-auto">
      <p className="text-muted-foreground mb-2 text-sm">{tableTitle}</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="pb-2">{timeLabel}</th>
            <th className="pb-2">{referredUserLabel}</th>
            <th className="pb-2">{orderValueLabel}</th>
            <th className="pb-2">{commissionPercentLabel}</th>
            <th className="pb-2">{commissionAmountLabel}</th>
          </tr>
        </thead>
        <tbody>
          {commissions.map((c, i) => (
            <CommissionRow key={commissionRowKey(c, i)} commission={c} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
