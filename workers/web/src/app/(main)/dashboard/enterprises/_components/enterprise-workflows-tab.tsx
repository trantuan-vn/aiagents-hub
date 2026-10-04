"use client";

import { useCallback, useEffect, useState } from "react";

import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminFlags, type AdminEnterpriseWorkflow } from "@/lib/enterprise-admin-api";
import { useEnterpriseErrorMessage } from "@/lib/enterprise-api";

import { TurnOffFlagButton } from "./turn-off-flag-button";

export function EnterpriseWorkflowsTab() {
  const t = useTranslations("EnterpriseAdminPage");
  const errorMessage = useEnterpriseErrorMessage();
  const [items, setItems] = useState<AdminEnterpriseWorkflow[] | null>(null);

  const load = useCallback(async () => {
    try {
      const { workflows } = await adminFlags.workflows();
      setItems(workflows);
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
        <p className="text-muted-foreground text-sm">{t("workflows_hint")}</p>
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
                <TableHead>{t("col_workflow")}</TableHead>
                <TableHead>{t("col_owner")}</TableHead>
                <TableHead>{t("col_organization")}</TableHead>
                <TableHead>{t("col_acceptance")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items === null ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground py-8 text-center">
                    {t("loading")}
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground py-8 text-center">
                    {t("no_enterprise_workflows")}
                  </TableCell>
                </TableRow>
              ) : (
                items.map((wf) => (
                  <TableRow key={`${wf.ownerId}:${wf.workflowId}`}>
                    <TableCell className="font-medium">{wf.name}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{wf.ownerIdentifier ?? wf.ownerId}</TableCell>
                    <TableCell>{wf.enterpriseName ?? wf.enterpriseId ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={wf.enterpriseAcceptance === "accepted" ? "default" : "outline"}>
                        {t(`acceptance_${wf.enterpriseAcceptance}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <TurnOffFlagButton
                        ownerId={wf.ownerId}
                        workflowId={wf.workflowId}
                        name={wf.name}
                        onDone={() => void load()}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
