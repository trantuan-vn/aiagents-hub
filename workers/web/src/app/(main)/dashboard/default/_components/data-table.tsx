"use client";

import * as React from "react";

import { useTranslations } from "next-intl";

import { useDataTableInstance } from "@/hooks/use-data-table-instance";

import { DataTable as DataTableNew } from "../../../../../components/data-table/data-table";
import { DataTablePagination } from "../../../../../components/data-table/data-table-pagination";
import { DataTableViewOptions } from "../../../../../components/data-table/data-table-view-options";

import { getVisitorsByCountryColumns, type VisitorByCountry, type VisitorByCountryRow } from "./columns-visitors";

export function DataTable({ visitorsByCountry }: { visitorsByCountry: VisitorByCountry[] }) {
  const tTable = useTranslations("DataTable");
  const data = React.useMemo<VisitorByCountryRow[]>(
    () =>
      visitorsByCountry.map((row, i) => ({
        ...row,
        id: `${row.country}-${i}`,
      })),
    [visitorsByCountry],
  );
  const columns = getVisitorsByCountryColumns(tTable);
  const table = useDataTableInstance<VisitorByCountryRow, unknown>({
    data,
    columns,
    getRowId: (row) => row.id,
  });

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-center justify-end">
        <DataTableViewOptions table={table} />
      </div>
      <div className="overflow-hidden rounded-lg border">
        <DataTableNew table={table} columns={columns} />
      </div>
      <DataTablePagination table={table} />
    </div>
  );
}
