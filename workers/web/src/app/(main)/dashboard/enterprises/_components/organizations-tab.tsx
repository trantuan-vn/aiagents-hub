"use client";

import { useCallback, useEffect, useState } from "react";

import { Plus, RefreshCw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { EnterpriseStatusBadge } from "@/components/enterprise/enterprise-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminEnterprises, type AdminEnterpriseListItem } from "@/lib/enterprise-admin-api";
import { formatEnterpriseDate, useEnterpriseErrorMessage } from "@/lib/enterprise-api";

import { CreateOrganizationDialog } from "./create-organization-dialog";
import { OrganizationSheet } from "./organization-sheet";

export function OrganizationsTab() {
  const t = useTranslations("EnterpriseAdminPage");
  const locale = useLocale();
  const errorMessage = useEnterpriseErrorMessage();
  const [items, setItems] = useState<AdminEnterpriseListItem[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { enterprises } = await adminEnterprises.list();
      setItems(enterprises);
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
        <p className="text-muted-foreground text-sm">{t("organizations_hint")}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="mr-1 h-4 w-4" />
            {t("refresh")}
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            {t("create_organization")}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("col_name")}</TableHead>
                <TableHead>{t("col_status")}</TableHead>
                <TableHead>{t("col_period_end")}</TableHead>
                <TableHead>{t("col_billable")}</TableHead>
                <TableHead>{t("col_active")}</TableHead>
                <TableHead>{t("col_workflows")}</TableHead>
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
                    {t("no_organizations")}
                  </TableCell>
                </TableRow>
              ) : (
                items.map((org) => {
                  const short = org.billableBusiness < 1 || org.billablePro < org.minProSeats;
                  return (
                    <TableRow key={org.id} className="cursor-pointer" onClick={() => setSelectedId(org.id)}>
                      <TableCell className="font-medium">{org.name}</TableCell>
                      <TableCell>
                        <EnterpriseStatusBadge status={org.status} adminHold={org.adminHold} />
                      </TableCell>
                      <TableCell>
                        {formatEnterpriseDate(org.periodEnd, locale)}
                        {org.seatGraceUntil ? (
                          <span className="block text-xs text-amber-600">
                            {t("grace_until", { date: formatEnterpriseDate(org.seatGraceUntil, locale) })}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className={short ? "text-destructive" : undefined}>
                        {t("seats_vs_min", {
                          business: org.billableBusiness,
                          pro: org.billablePro,
                          minPro: org.minProSeats,
                        })}
                      </TableCell>
                      <TableCell>{t("seats", { business: org.activeBusiness, pro: org.activePro })}</TableCell>
                      <TableCell>
                        {t("workflow_counts", { pending: org.workflows.pending, accepted: org.workflows.accepted })}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CreateOrganizationDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => {
          void load();
          setSelectedId(id);
        }}
      />
      <OrganizationSheet enterpriseId={selectedId} onClose={() => setSelectedId(null)} onChanged={() => void load()} />
    </div>
  );
}
