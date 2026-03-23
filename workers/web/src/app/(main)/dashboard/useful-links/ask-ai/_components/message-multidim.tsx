"use client";

import * as React from "react";

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface MultidimPayload {
  dimensions?: string[];
  metrics?: string[];
  filters?: Record<string, string>;
  data?: Array<Record<string, unknown>>;
}

export function MessageMultidim({ payload }: { payload: MultidimPayload }) {
  const [dimension, setDimension] = React.useState(payload.dimensions?.[0] ?? "name");
  const [metric, setMetric] = React.useState(payload.metrics?.[0] ?? "value");
  const data = React.useMemo((): Record<string, unknown>[] => payload.data ?? [], [payload.data]);

  const chartConfig = React.useMemo<ChartConfig>(
    () => ({
      [metric]: { label: metric, color: "#3b82f6" },
    }),
    [metric],
  );

  const columns: ColumnDef<Record<string, unknown>>[] = React.useMemo(() => {
    const keys = data[0] ? Object.keys(data[0] as object) : [];
    return keys.map((k) => ({ accessorKey: k, header: k }));
  }, [data]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  if (data.length === 0) {
    return (
      <p className="text-muted-foreground py-4 text-sm">
        Chưa có dữ liệu. Chọn dimensions, metrics và filters phía trên.
      </p>
    );
  }

  return (
    <div className="bg-card space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap gap-4">
        {payload.dimensions && payload.dimensions.length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs">Dimension</Label>
            <Select value={dimension} onValueChange={setDimension}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {payload.dimensions.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {payload.metrics && payload.metrics.length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs">Metric</Label>
            <Select value={metric} onValueChange={setMetric}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {payload.metrics.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <ChartContainer config={chartConfig} className="h-[200px] w-full">
        <BarChart data={data} margin={{ left: 0, right: 16 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={dimension} />
          <YAxis />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey={metric} fill={`var(--color-${metric})`} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartContainer>

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
                <TableCell key={cell.id}>{String(cell.getValue() ?? "")}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {table.getPageCount() > 1 && (
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Trước
          </Button>
          <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            Sau
          </Button>
        </div>
      )}
    </div>
  );
}
