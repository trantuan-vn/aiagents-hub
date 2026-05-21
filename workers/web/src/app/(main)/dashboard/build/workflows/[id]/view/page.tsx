"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import { StarDisplay } from "../../_components/star-display";
import { WorkflowEditor } from "../../_components/workflow-editor";
import { WorkflowExecuteDialog } from "../../_components/workflow-execute-dialog";
import { getSharedWorkflow, type AgentWorkflow } from "../../_lib/api";
import { readServiceEndpointFromDefinition } from "../../_lib/definition-utils";

interface ViewWorkflowState {
  name: string;
  description: string;
  definition: string;
  serviceEndpoint: string;
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
    serviceEndpoint: readServiceEndpointFromDefinition(def),
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
  serviceEndpoint: "",
  starLabel: "",
  communityStarAvg: 0,
  communityStarCount: 0,
  usageCount: 0,
};

function ViewWorkflowHeader({
  name,
  description,
  communityStarAvg,
  communityStarCount,
  starLabel,
  usageCount,
  labels,
}: ViewWorkflowState & {
  labels: {
    usageCount: string;
    raterCount: (p: { count: number }) => string;
    name: string;
    descriptionField: string;
  };
}) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{name}</h1>
        {description ? <p className="text-muted-foreground mt-1 text-sm">{description}</p> : null}
      </div>
      <div className="text-muted-foreground flex flex-wrap items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <StarDisplay count={communityStarAvg} size="md" />
          <span>{labels.raterCount({ count: communityStarCount })}</span>
        </div>
        {starLabel ? <Badge variant="secondary">{starLabel}</Badge> : null}
        <span>
          {labels.usageCount}: {usageCount}
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>{labels.name}</Label>
          <p className="text-sm">{name}</p>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>{labels.descriptionField}</Label>
          <p className="text-sm whitespace-pre-wrap">{description || "—"}</p>
        </div>
      </div>
    </div>
  );
}

export default function ViewSharedWorkflowPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = Number(params.id);
  const ownerId = searchParams.get("owner") ?? "";
  const t = useTranslations("WorkflowsPage");
  const tv = useTranslations("WorkflowViewPage");

  const [view, setView] = useState<ViewWorkflowState>(EMPTY_VIEW_STATE);
  const [loading, setLoading] = useState(true);
  const [executeOpen, setExecuteOpen] = useState(false);

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

  if (loading) return <p className="text-muted-foreground p-6 text-sm">...</p>;

  const chatHref = `/dashboard/build/workflows/${id}/chat?owner=${encodeURIComponent(ownerId)}`;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-1">
      <WorkflowExecuteDialog workflowId={id} ownerId={ownerId} open={executeOpen} onOpenChange={setExecuteOpen} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" asChild>
          <Link href="/dashboard/build/workflows">{tv("back")}</Link>
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={chatHref}>{tv("chat")}</Link>
          </Button>
          <Button variant="secondary" onClick={() => setExecuteOpen(true)}>
            {tv("execute")}
          </Button>
        </div>
      </div>
      <ViewWorkflowHeader
        {...view}
        labels={{
          usageCount: t("usage_count"),
          raterCount: (p) => tv("rater_count", p),
          name: t("name"),
          descriptionField: t("description_field"),
        }}
      />
      <WorkflowEditor definitionJson={view.definition} readOnly serviceEndpoint={view.serviceEndpoint} />
    </div>
  );
}
