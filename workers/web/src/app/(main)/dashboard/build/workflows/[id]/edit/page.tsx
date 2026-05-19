"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";
import { useParams } from "next/navigation";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { WorkflowEditor } from "../../_components/workflow-editor";
import { WorkflowExecuteDialog } from "../../_components/workflow-execute-dialog";
import { getWorkflow, updateWorkflow } from "../../_lib/api";
import { mergeAgentServiceEndpoint, readServiceEndpointFromDefinition } from "../../_lib/definition-utils";

export default function EditWorkflowPage() {
  const params = useParams();
  const id = Number(params.id);
  const t = useTranslations("WorkflowsPage");
  const te = useTranslations("WorkflowEditorPage");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [definition, setDefinition] = useState('{"nodes":[],"edges":[]}');
  const [isShared, setIsShared] = useState(false);
  const [starCount, setStarCount] = useState(0);
  const [starLabel, setStarLabel] = useState("");
  const [serviceEndpoint, setServiceEndpoint] = useState("");
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [executeOpen, setExecuteOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id || isNaN(id)) return;
    setLoading(true);
    try {
      const { workflow } = await getWorkflow(id);
      setName(workflow.name);
      setDescription(workflow.description ?? "");
      const def = workflow.definition || '{"nodes":[],"edges":[]}';
      setDefinition(def);
      setServiceEndpoint(readServiceEndpointFromDefinition(def));
      setIsShared(!!workflow.isShared);
      setStarCount(workflow.starCount ?? 0);
      setStarLabel(workflow.starLabel ?? "");
      setStatus(workflow.status === "published" ? "published" : "draft");
    } catch {
      toast.error(t("load_error"));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSave = async () => {
    setSaving(true);
    try {
      await updateWorkflow(id, {
        name,
        description,
        definition: mergeAgentServiceEndpoint(definition, serviceEndpoint),
        isShared,
        starCount,
        starLabel,
        status,
      });
      toast.success(t("saved"));
    } catch {
      toast.error(t("save_error"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-muted-foreground p-6 text-sm">...</p>;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-1">
      <WorkflowExecuteDialog workflowId={id} open={executeOpen} onOpenChange={setExecuteOpen} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" asChild>
          <Link href="/dashboard/build/workflows">{te("back")}</Link>
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/dashboard/build/workflows/${id}/chat`}>{te("chat")}</Link>
          </Button>
          <Button variant="secondary" onClick={() => setExecuteOpen(true)}>
            {te("execute")}
          </Button>
          <Button onClick={() => void onSave()} disabled={saving}>
            {te("save")}
          </Button>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>{t("name")}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>
            {t("status_draft")} / {t("status_published")}
          </Label>
          <select
            className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value as "draft" | "published")}
          >
            <option value="draft">{t("status_draft")}</option>
            <option value="published">{t("status_published")}</option>
          </select>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>{t("description_field")}</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </div>
      </div>
      <WorkflowEditor
        definitionJson={definition}
        onDefinitionChange={setDefinition}
        isShared={isShared}
        onSharedChange={setIsShared}
        starCount={starCount}
        onStarCountChange={setStarCount}
        starLabel={starLabel}
        onStarLabelChange={setStarLabel}
        serviceEndpoint={serviceEndpoint}
        onServiceEndpointChange={setServiceEndpoint}
      />
    </div>
  );
}
