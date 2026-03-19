import { ColumnDef } from "@tanstack/react-table";

import { DataTableColumnHeader } from "../../../../../components/data-table/data-table-column-header";

export interface VisitorByCountry {
  country: string;
  count: number;
}

export type VisitorByCountryRow = VisitorByCountry & { id: string };

export function getVisitorsByCountryColumns(t: (key: string) => string): ColumnDef<VisitorByCountryRow>[] {
  return [
    {
      accessorKey: "country",
      header: ({ column }) => <DataTableColumnHeader column={column} title={t("country")} />,
      cell: ({ row }) => {
        const code = row.original.country;
        if (code === "XX" || !code) return "Unknown";
        try {
          const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
          return regionNames.of(code) ?? code;
        } catch {
          return code;
        }
      },
      enableSorting: true,
    },
    {
      accessorKey: "count",
      header: ({ column }) => (
        <DataTableColumnHeader className="w-full text-right" column={column} title={t("total_visitors")} />
      ),
      cell: ({ row }) => (
        <div className="text-right font-medium tabular-nums">{row.original.count.toLocaleString()}</div>
      ),
      enableSorting: true,
    },
  ];
}
