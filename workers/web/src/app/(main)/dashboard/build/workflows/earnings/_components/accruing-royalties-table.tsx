"use client";

import { formatUsd } from "@/lib/utils";

interface AccruingRoyaltiesTableProps {
  royalties: Record<string, unknown>[];
  tableTitle: string;
  workflowLabel: string;
  amountLabel: string;
  dateLabel: string;
}

export function AccruingRoyaltiesTable({
  royalties,
  tableTitle,
  workflowLabel,
  amountLabel,
  dateLabel,
}: AccruingRoyaltiesTableProps) {
  return (
    <div className="overflow-x-auto">
      <p className="text-muted-foreground mb-2 text-sm">{tableTitle}</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="pb-2">{workflowLabel}</th>
            <th className="pb-2">{amountLabel}</th>
            <th className="pb-2">{dateLabel}</th>
          </tr>
        </thead>
        <tbody>
          {royalties.map((r) => (
            <tr
              key={String(r.globalId ?? r.id ?? r.created_at ?? JSON.stringify(r))}
              className="border-muted/50 border-b"
            >
              <td className="py-2">{String(r.workflowId ?? "")}</td>
              <td className="py-2">
                {formatUsd(Number(r.royaltyAmountUsd ?? 0))}
              </td>
              <td className="text-muted-foreground py-2">
                {r.created_at ? new Date(Number(r.created_at)).toLocaleDateString() : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
