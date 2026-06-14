"use client";

import { useEffect, useState } from "react";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";

import { GitBranch } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

import { WorkflowChat } from "../../_components/chat/workflow-chat";
import { getSharedWorkflow, getWorkflow } from "../../_lib/api";

export default function WorkflowChatPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = Number(params.id);
  const ownerId = searchParams.get("owner") ?? undefined;
  const t = useTranslations("WorkflowChatPage");
  const [name, setName] = useState<string>("");

  useEffect(() => {
    if (!id || isNaN(id)) return;
    const load = async () => {
      try {
        if (ownerId) {
          const { workflow } = await getSharedWorkflow(ownerId, id);
          setName(workflow.name);
        } else {
          const { workflow } = await getWorkflow(id);
          setName(workflow.name);
        }
      } catch {
        setName("");
      }
    };
    void load();
  }, [id, ownerId]);

  if (!id || isNaN(id)) {
    return <p className="text-muted-foreground p-6 text-sm">{t("invalid")}</p>;
  }

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="bg-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
            <GitBranch className="text-muted-foreground h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
            <p className="text-muted-foreground mt-1 text-sm">{t("description")}</p>
          </div>
        </div>
        <Button variant="outline" asChild>
          <Link href={ownerId ? "/dashboard/build/workflows" : `/dashboard/build/workflows/${id}/edit`}>
            {t("back")}
          </Link>
        </Button>
      </div>
      <WorkflowChat workflowId={id} ownerId={ownerId} workflowName={name} />
    </div>
  );
}
