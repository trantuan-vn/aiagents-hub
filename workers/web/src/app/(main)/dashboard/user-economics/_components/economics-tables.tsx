"use client";

import { useTranslations } from "next-intl";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { DualValue } from "./dual-value";
import type { UserEconomicsReport } from "./types";

export function EconomicsTables({
  data,
  onSelectUser,
}: {
  data: UserEconomicsReport;
  onSelectUser?: (identifier: string) => void;
}) {
  const t = useTranslations("UserEconomicsAdmin");

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("by_class")}</CardTitle>
          <CardDescription>{t("by_class_desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("class")}</TableHead>
                <TableHead className="text-right">{t("runs")}</TableHead>
                <TableHead className="text-right">{t("hub_revenue")}</TableHead>
                <TableHead className="text-right">{t("contribution")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.byClass.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    {t("no_data")}
                  </TableCell>
                </TableRow>
              ) : (
                data.byClass.map((row) => (
                  <TableRow key={row.modelClass}>
                    <TableCell className="font-medium">{row.modelClass}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.runs.toLocaleString()}</TableCell>
                    <TableCell>
                      <DualValue amount={row.hubRevenue} size="sm" />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-end gap-0.5">
                        <DualValue amount={row.contribution} size="sm" />
                        <span className="text-muted-foreground text-xs">{row.contributionPct.toFixed(1)}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {data.scope === "all" ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("top_users")}</CardTitle>
            <CardDescription>{t("top_users_desc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("user")}</TableHead>
                  <TableHead className="text-right">{t("runs")}</TableHead>
                  <TableHead className="text-right">{t("user_charged")}</TableHead>
                  <TableHead className="text-right">{t("contribution")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      {t("no_data")}
                    </TableCell>
                  </TableRow>
                ) : (
                  data.topUsers.map((row) => (
                    <TableRow key={row.userId}>
                      <TableCell className="max-w-[280px] truncate font-medium" title={row.identifier}>
                        {onSelectUser && row.identifier.includes("@") ? (
                          <button
                            type="button"
                            className="hover:text-primary truncate text-left underline-offset-4 hover:underline"
                            onClick={() => onSelectUser(row.identifier)}
                          >
                            {row.identifier}
                          </button>
                        ) : (
                          row.identifier
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.runs.toLocaleString()}</TableCell>
                      <TableCell>
                        <DualValue amount={row.userCharged} size="sm" />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-end gap-0.5">
                          <DualValue amount={row.contribution} size="sm" />
                          <span className="text-muted-foreground text-xs">{row.contributionPct.toFixed(1)}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
