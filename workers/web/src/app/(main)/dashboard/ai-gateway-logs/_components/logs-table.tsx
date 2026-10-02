"use client";

import { Fragment } from "react";

import { useTranslations } from "next-intl";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { formatCostUsd, formatGatewayTime } from "./format";
import { LogInspector, type GatewayLogDetail } from "./inspector";

export type GatewayLogRow = {
  id: string;
  createdAt: string;
  status: "success" | "cached" | "error";
  model: string;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  durationMs: number;
  userAgent: string | null;
  step: number | null;
  kind: string | null;
  nodeId: string | null;
  executionKey?: string | null;
};

const DOT: Record<GatewayLogRow["status"], string> = {
  success: "bg-emerald-500",
  cached: "bg-sky-500",
  error: "bg-red-500",
};

export function LogsTable({
  rows,
  selectedId,
  onSelect,
  detail,
  detailLoading,
  detailError,
  onOpenExecution,
}: {
  rows: GatewayLogRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  detail: GatewayLogDetail | null;
  detailLoading: boolean;
  detailError: string | null;
  onOpenExecution?: (executionKey: string) => void;
}) {
  const t = useTranslations("AiGatewayLogsAdmin");

  const usage = (row: GatewayLogRow) => {
    if (row.tokensIn == null && row.tokensOut == null) return t("usage_empty");
    return t("usage_in_out", { in: row.tokensIn ?? "—", out: row.tokensOut ?? "—" });
  };

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("col_time")}</TableHead>
            <TableHead>{t("col_status")}</TableHead>
            <TableHead>{t("col_model")}</TableHead>
            <TableHead>{t("col_usage")}</TableHead>
            <TableHead>{t("col_cost")}</TableHead>
            <TableHead>{t("col_duration")}</TableHead>
            <TableHead>{t("col_user_agent")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const selected = row.id === selectedId;
            const meta = [row.kind, row.nodeId].filter(Boolean).join(" · ");
            return (
              <Fragment key={row.id}>
                <TableRow
                  data-state={selected ? "selected" : undefined}
                  className={selected ? "bg-muted/60" : "cursor-pointer"}
                  onClick={() => onSelect(row.id)}
                >
                  <TableCell className="font-mono text-xs whitespace-nowrap">
                    {formatGatewayTime(row.createdAt)}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-2 text-xs">
                      <span className={`size-2 rounded-full ${DOT[row.status]}`} aria-hidden />
                      {t(`status_${row.status}`)}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[240px] font-mono text-xs">
                    <div className="truncate">{row.model}</div>
                    {meta || (row.step != null && row.step > 0) ? (
                      <div className="text-muted-foreground truncate text-[11px]">
                        {meta}
                        {row.step != null && row.step > 0 ? ` · ${t("retry_step", { step: row.step })}` : ""}
                      </div>
                    ) : null}
                    {onOpenExecution && row.executionKey ? (
                      <button
                        type="button"
                        className="text-primary block max-w-full truncate text-left text-[11px] underline-offset-2 hover:underline"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenExecution(row.executionKey!);
                        }}
                      >
                        {t("open_execution")}
                      </button>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{usage(row)}</TableCell>
                  <TableCell className="font-mono text-xs">{formatCostUsd(row.costUsd)}</TableCell>
                  <TableCell className="text-xs">{row.durationMs} ms</TableCell>
                  <TableCell className="max-w-[180px] truncate text-xs">{row.userAgent || "—"}</TableCell>
                </TableRow>
                {selected ? (
                  <TableRow>
                    <TableCell colSpan={7} className="p-0">
                      <LogInspector
                        detail={detail && detail.id === row.id ? detail : null}
                        loading={detailLoading}
                        error={detailError}
                      />
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
