"use client";

import * as React from "react";

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.unitoken.trade";

interface TablePayload {
  endpoint?: string;
  queryParams?: Record<string, string>;
  columns?: Array<{ key: string; label: string }>;
  data?: unknown[];
}

function exportToCSV(data: Record<string, unknown>[], columns: string[]) {
  const header = columns.join(",");
  const rows = data.map((row) => columns.map((c) => JSON.stringify(row[c] ?? "")).join(","));
  return [header, ...rows].join("\n");
}

export function MessageTable({ payload }: { payload: TablePayload }) {
  const [data, setData] = React.useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function fetchData() {
      if (payload.data && Array.isArray(payload.data)) {
        setData(payload.data as Record<string, unknown>[]);
        setLoading(false);
        return;
      }
      if (!payload.endpoint) {
        setLoading(false);
        return;
      }
      try {
        const params = new URLSearchParams(payload.queryParams ?? {});
        const url = `${API_BASE_URL}${payload.endpoint}${params.toString() ? `?${params}` : ""}`;
        const res = await fetch(url, { credentials: "include" });
        const json = (await res.json()) as { error?: string; items?: unknown[]; data?: unknown[] };
        if (!res.ok) throw new Error(json.error ?? "Failed");
        const rawItems = Array.isArray(json) ? json : (json.items ?? json.data ?? []);
        const items: Record<string, unknown>[] = rawItems as Record<string, unknown>[];
        setData(items);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [payload.endpoint, payload.queryParams, payload.data]);

  const columns = payload.columns ?? (data[0] ? Object.keys(data[0] as object).map((k) => ({ key: k, label: k })) : []);
  const columnDefs: ColumnDef<Record<string, unknown>>[] = columns.map((c) => ({
    accessorKey: c.key,
    header: c.label,
    cell: ({ getValue }) => {
      const v = getValue();
      if (v === null || v === undefined) return "";
      if (typeof v === "object") return JSON.stringify(v);
      return String(v);
    },
  }));

  const table = useReactTable({
    data,
    columns: columnDefs,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const handleExport = () => {
    const cols = columns.map((c) => c.key);
    const csv = exportToCSV(data, cols);
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "export.csv";
    a.click();
  };

  if (loading) return <div className="text-muted-foreground py-4 text-sm">Đang tải...</div>;
  if (error) return <p className="text-destructive text-sm">{error}</p>;

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="bg-muted/50 flex items-center justify-end gap-2 border-b px-4 py-2">
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="mr-1 size-4" />
          Export CSV
        </Button>
      </div>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((h) => (
                <TableHead key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell ?? (() => String(cell.getValue())), cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between px-4 py-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Trước
          </Button>
          <span className="text-muted-foreground text-sm">
            Trang {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
          </span>
          <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            Sau
          </Button>
        </div>
      )}
    </div>
  );
}
