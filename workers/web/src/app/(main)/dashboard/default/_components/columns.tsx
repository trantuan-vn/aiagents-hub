import { ColumnDef } from "@tanstack/react-table";
import { CircleCheck, Loader, EllipsisVertical } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { DataTableColumnHeader } from "../../../../../components/data-table/data-table-column-header";

import { sectionSchema } from "./schema";
import { TableCellViewer } from "./table-cell-viewer";

export function getDashboardColumns(t: (key: string) => string): ColumnDef<z.infer<typeof sectionSchema>>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <div className="flex items-center justify-center">
          <Checkbox
            checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex items-center justify-center">
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "header",
      header: ({ column }) => <DataTableColumnHeader column={column} title={t("header")} />,
      cell: ({ row }) => {
        return <TableCellViewer item={row.original} />;
      },
      enableSorting: false,
    },
    {
      accessorKey: "type",
      header: ({ column }) => <DataTableColumnHeader column={column} title={t("section_type")} />,
      cell: ({ row }) => (
        <div className="w-32">
          <Badge variant="outline" className="text-muted-foreground px-1.5">
            {row.original.type}
          </Badge>
        </div>
      ),
      enableSorting: false,
    },
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title={t("status")} />,
      cell: ({ row }) => {
        const statusText = row.original.status === "Done" ? t("done") : row.original.status;
        return (
          <Badge variant="outline" className="text-muted-foreground px-1.5">
            {row.original.status === "Done" ? (
              <CircleCheck className="stroke-border fill-green-500 dark:fill-green-400" />
            ) : (
              <Loader />
            )}
            {statusText}
          </Badge>
        );
      },
      enableSorting: false,
    },
    {
      accessorKey: "target",
      header: ({ column }) => (
        <DataTableColumnHeader className="w-full text-right" column={column} title={t("target")} />
      ),
      cell: ({ row }) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            toast.promise(new Promise((resolve) => setTimeout(resolve, 1000)), {
              loading: `${t("saving")} ${row.original.header}`,
              success: t("done"),
              error: t("error"),
            });
          }}
        >
          <Label htmlFor={`${row.original.id}-target`} className="sr-only">
            {t("target")}
          </Label>
          <Input
            className="hover:bg-input/30 focus-visible:bg-background dark:hover:bg-input/30 dark:focus-visible:bg-input/30 h-8 w-16 border-transparent bg-transparent text-right shadow-none focus-visible:border dark:bg-transparent"
            defaultValue={row.original.target}
            id={`${row.original.id}-target`}
          />
        </form>
      ),
      enableSorting: false,
    },
    {
      accessorKey: "limit",
      header: ({ column }) => (
        <DataTableColumnHeader className="w-full text-right" column={column} title={t("limit")} />
      ),
      cell: ({ row }) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            toast.promise(new Promise((resolve) => setTimeout(resolve, 1000)), {
              loading: `${t("saving")} ${row.original.header}`,
              success: t("done"),
              error: t("error"),
            });
          }}
        >
          <Label htmlFor={`${row.original.id}-limit`} className="sr-only">
            {t("limit")}
          </Label>
          <Input
            className="hover:bg-input/30 focus-visible:bg-background dark:hover:bg-input/30 dark:focus-visible:bg-input/30 h-8 w-16 border-transparent bg-transparent text-right shadow-none focus-visible:border dark:bg-transparent"
            defaultValue={row.original.limit}
            id={`${row.original.id}-limit`}
          />
        </form>
      ),
      enableSorting: false,
    },
    {
      accessorKey: "reviewer",
      header: ({ column }) => <DataTableColumnHeader column={column} title={t("reviewer")} />,
      cell: ({ row }) => {
        const assignReviewerText = t("assign_reviewer");
        const isAssigned = row.original.reviewer !== "Assign reviewer" && row.original.reviewer !== assignReviewerText;

        if (isAssigned) {
          return row.original.reviewer;
        }

        return (
          <>
            <Label htmlFor={`${row.original.id}-reviewer`} className="sr-only">
              {t("reviewer")}
            </Label>
            <Select>
              <SelectTrigger
                className="w-38 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate"
                size="sm"
                id={`${row.original.id}-reviewer`}
              >
                <SelectValue placeholder={assignReviewerText} />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="Eddie Lake">Eddie Lake</SelectItem>
                <SelectItem value="Jamik Tashpulatov">Jamik Tashpulatov</SelectItem>
              </SelectContent>
            </Select>
          </>
        );
      },
      enableSorting: false,
    },
    {
      id: "actions",
      cell: () => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="data-[state=open]:bg-muted text-muted-foreground flex size-8"
              size="icon"
            >
              <EllipsisVertical />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-32">
            <DropdownMenuItem>{t("edit")}</DropdownMenuItem>
            <DropdownMenuItem>{t("make_a_copy")}</DropdownMenuItem>
            <DropdownMenuItem>{t("favorite")}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">{t("delete")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      enableSorting: false,
    },
  ];
}
