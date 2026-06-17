"use client";

import { useCallback, useEffect, useState } from "react";

import { useParams, useSearchParams } from "next/navigation";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";

import { StarDisplay } from "../../_components/list/star-display";
import { WorkflowEditor } from "../../_components/editor/workflow-editor";
import { WorkflowEditorShell } from "../../_components/editor/workflow-editor-shell";
import { getSharedWorkflow, type AgentWorkflow } from "../../_lib/api";
interface ViewWorkflowState {
  name: string;
  description: string;
  definition: string;
  starLabel: string;
  communityStarAvg: number;
  communityStarCount: number;
  usageCount: number;
}

function buildViewStateFromWorkflow(workflow: AgentWorkflow): ViewWorkflowState {
  const def = workflow.definition || '{"nodes":[],"edges":[]}';
  return {
    name: workflow.name,
    description: workflow.description ?? "",
    definition: def,
    starLabel: workflow.starLabel ?? "",
    communityStarAvg: workflow.communityStarAvg ?? 0,
    communityStarCount: workflow.communityStarCount ?? 0,
    usageCount: workflow.usageCount ?? 0,
  };
}

const EMPTY_VIEW_STATE: ViewWorkflowState = {
  name: "",
  description: "",
  definition: '{"nodes":[],"edges":[]}',
  starLabel: "",
  communityStarAvg: 0,
  communityStarCount: 0,
  usageCount: 0,
};

export default function ViewSharedWorkflowPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = Number(params.id);
  const ownerId = searchParams.get("owner") ?? "";
  const t = useTranslations("WorkflowsPage");
  const tv = useTranslations("WorkflowViewPage");

  const [view, setView] = useState<ViewWorkflowState>(EMPTY_VIEW_STATE);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id || isNaN(id) || !ownerId) return;
    setLoading(true);
    try {
      const { workflow } = await getSharedWorkflow(ownerId, id);
      setView(buildViewStateFromWorkflow(workflow));
    } catch {
      toast.error(t("load_error"));
    } finally {
      setLoading(false);
    }
  }, [id, ownerId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!id || isNaN(id) || !ownerId) {
    return <p className="text-muted-foreground p-6 text-sm">{tv("invalid")}</p>;
  }

  if (loading) {
    return <p className="text-muted-foreground p-6 text-sm">...</p>;
  }

  const headerMeta = (
    <>
      <div className="flex items-center gap-1.5">
        <StarDisplay count={view.communityStarAvg} size="sm" />
        <span className="text-muted-foreground text-xs">{tv("rater_count", { count: view.communityStarCount })}</span>
      </div>
      {view.starLabel ? (
        <Badge variant="secondary" className="text-[10px]">
          {view.starLabel}
        </Badge>
      ) : null}
      <span className="text-muted-foreground text-xs">
        {t("usage_count")}: {view.usageCount}
      </span>
    </>
  );

  return (
    <>
      <WorkflowEditorShell
        readOnly
        workflowId={id}
        workflowName={view.name}
        headerMeta={headerMeta}
        backHref="/dashboard/build/workflows"
        backLabel={tv("back")}
        onExecute={() => {}}
      >
        <WorkflowEditor
          workflowId={id}
          ownerId={ownerId}
          definitionJson={view.definition}
          readOnly
        />
      </WorkflowEditorShell>
    </>
  );
}
