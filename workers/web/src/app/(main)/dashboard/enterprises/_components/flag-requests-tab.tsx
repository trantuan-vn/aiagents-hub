"use client";

import { useCallback, useEffect, useState } from "react";

import { RefreshCw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminFlags, type AdminFlagRequestListItem } from "@/lib/enterprise-admin-api";
import { formatEnterpriseDate, useEnterpriseErrorMessage } from "@/lib/enterprise-api";

import { FlagRequestDialog } from "./flag-request-dialog";

export function FlagRequestsTab() {
  const t = useTranslations("EnterpriseAdminPage");
  const locale = useLocale();
  const errorMessage = useEnterpriseErrorMessage();
  const [items, setItems] = useState<AdminFlagRequestListItem[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { requests } = await adminFlags.list();
      setItems(requests);
    } catch (err) {
      setItems([]);
      toast.error(errorMessage(err));
    }
  }, [errorMessage]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">{t("requests_hint")}</p>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="mr-1 h-4 w-4" />
          {t("refresh")}
        </Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("col_owner")}</TableHead>
                <TableHead>{t("col_workflow")}</TableHead>
                <TableHead>{t("col_state")}</TableHead>
                <TableHead>{t("col_note")}</TableHead>
                <TableHead>{t("col_requested_at")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items === null ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground py-8 text-center">
                    {t("loading")}
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground py-8 text-center">
                    {t("no_requests")}
                  </TableCell>
                </TableRow>
              ) : (
                items.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="max-w-[200px] truncate">{r.ownerIdentifier ?? r.workflowOwnerId}</TableCell>
                    <TableCell className="font-medium">{r.workflow?.name ?? t("workflow_missing")}</TableCell>
                    <TableCell>
                      {r.workflow ? (
                        <span className="flex gap-1">
                          <Badge variant="outline">
                            {t(`wf_status_${r.workflow.status === "published" ? "published" : "draft"}`)}
                          </Badge>
                          {r.workflow.isShared ? <Badge variant="secondary">{t("shared")}</Badge> : null}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[260px] truncate">{r.note ?? "—"}</TableCell>
                    <TableCell>{formatEnterpriseDate(r.createdAt, locale)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" onClick={() => setOpenId(r.id)}>
                        {t("review")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <FlagRequestDialog requestId={openId} onClose={() => setOpenId(null)} onResolved={() => void load()} />
    </div>
  );
}
