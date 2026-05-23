"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

import { deleteWorkflow, listMyWorkflows, type AgentWorkflow } from "../_lib/api";

import { StarDisplay } from "./star-display";
import { WorkflowExecuteDialog } from "./workflow-execute-dialog";

export function MyWorkflowsTab() {
  const t = useTranslations("WorkflowsPage");
  const [items, setItems] = useState<AgentWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [executeId, setExecuteId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { workflows } = await listMyWorkflows();
      setItems(workflows);
    } catch {
      toast.error(t("load_error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const onDelete = async (id: number) => {
    if (!confirm(t("delete_confirm"))) return;
    try {
      await deleteWorkflow(id);
      toast.success(t("deleted"));
      void load();
    } catch {
      toast.error(t("load_error"));
    }
  };

  if (loading) return <p className="text-muted-foreground text-sm">...</p>;
  if (!items.length) return <p className="text-muted-foreground text-sm">{t("no_workflows")}</p>;

  return (
    <>
      <WorkflowExecuteDialog
        workflowId={executeId ?? 0}
        open={executeId != null}
        onOpenChange={(open) => !open && setExecuteId(null)}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((wf) => (
          <Card key={wf.id}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base">{wf.name}</CardTitle>
                <Badge variant={wf.status === "published" ? "default" : "secondary"}>
                  {wf.status === "published" ? t("status_published") : t("status_draft")}
                </Badge>
              </div>
              <CardDescription className="line-clamp-2">{wf.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-muted-foreground flex flex-wrap gap-3 text-xs">
                <StarDisplay count={wf.starCount} />
                {wf.isShared ? <Badge variant="outline">{t("share_toggle")}</Badge> : null}
                <span>
                  {t("usage_count")}: {wf.usageCount ?? 0}
                </span>
                <span>
                  {t("earnings")}: {formatCurrency(wf.totalEarningsUsd ?? 0, { maximumFractionDigits: 4 })}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="default" asChild>
                  <Link href={`/dashboard/build/workflows/${wf.id}/edit`}>{t("edit")}</Link>
                </Button>
                <Button size="sm" variant="outline" onClick={() => wf.id && setExecuteId(wf.id)}>
                  {t("execute")}
                </Button>
                <Button size="sm" variant="ghost" asChild>
                  <Link href={`/dashboard/build/workflows/${wf.id}/chat`}>{t("open_chat")}</Link>
                </Button>
                <Button size="sm" variant="destructive" onClick={() => wf.id && onDelete(wf.id)}>
                  {t("delete")}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
