"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import type { OverviewDto } from "./types";

export function InventoryTable({ data }: { data: OverviewDto }) {
  const t = useTranslations("CloudflareUsageAdmin");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("inventory")}</CardTitle>
        <CardDescription>{t("inventory_desc")}</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("col_kind")}</TableHead>
              <TableHead>{t("col_name")}</TableHead>
              <TableHead>{t("col_status")}</TableHead>
              <TableHead>{t("col_notes")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.inventory.map((row) => (
              <TableRow key={`${row.kind}:${row.id}`}>
                <TableCell>{row.kind}</TableCell>
                <TableCell className="font-medium">
                  {row.name}
                  <div className="text-muted-foreground font-mono text-xs">{row.id}</div>
                </TableCell>
                <TableCell>
                  <Badge variant={row.status === "ok" ? "secondary" : "destructive"}>
                    {row.status === "orphan" ? t("orphan_resource") : row.status === "missing" ? t("missing_resource") : t("ok")}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">{row.notes.join(" · ") || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
