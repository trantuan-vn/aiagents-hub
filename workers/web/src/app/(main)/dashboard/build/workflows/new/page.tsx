"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { WorkflowEditor } from "../_components/workflow-editor";
import { createWorkflow } from "../_lib/api";
import { mergeAgentServiceEndpoint } from "../_lib/definition-utils";

export default function NewWorkflowPage() {
  const t = useTranslations("WorkflowsPage");
  const te = useTranslations("WorkflowEditorPage");
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [definition, setDefinition] = useState('{"nodes":[],"edges":[]}');
  const [serviceEndpoint, setServiceEndpoint] = useState("");
  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    if (!name.trim() || !slug.trim()) {
      toast.error(t("save_error"));
      return;
    }
    setSaving(true);
    try {
      const { workflow } = await createWorkflow({
        name: name.trim(),
        slug: slug.trim().toLowerCase().replace(/\s+/g, "-"),
        description,
        definition: mergeAgentServiceEndpoint(definition, serviceEndpoint),
        status: "draft",
        isShared: false,
      });
      toast.success(t("saved"));
      if (workflow.id) router.push(`/dashboard/build/workflows/${workflow.id}/edit`);
    } catch {
      toast.error(t("save_error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-1">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>{t("name")}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>{t("slug")}</Label>
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="my-workflow" />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>{t("description_field")}</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>{te("agent_service_endpoint")}</Label>
        <Input
          value={serviceEndpoint}
          onChange={(e) => setServiceEndpoint(e.target.value)}
          placeholder="/api/..."
        />
      </div>
      <WorkflowEditor
        definitionJson={definition}
        onDefinitionChange={setDefinition}
        serviceEndpoint={serviceEndpoint}
      />
      <div className="flex gap-2">
        <Button onClick={() => void onSave()} disabled={saving}>
          {te("save")}
        </Button>
        <Button variant="outline" onClick={() => router.back()}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}
