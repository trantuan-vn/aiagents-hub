"use client";

import { useEffect, useRef } from "react";

import { useRouter } from "next/navigation";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { createWorkflow } from "../_lib/api";
import { serializeWorkflowTags } from "../_lib/workflow-tags";

export default function NewWorkflowPage() {
  const te = useTranslations("WorkflowEditorPage");
  const t = useTranslations("WorkflowsPage");
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const { workflow } = await createWorkflow({
          name: te("untitled"),
          definition: '{"nodes":[],"edges":[]}',
          tags: serializeWorkflowTags([]),
          status: "draft",
          isShared: false,
        });
        if (workflow.id) {
          router.replace(`/dashboard/build/workflows/${workflow.id}/edit`);
        } else {
          throw new Error("Missing workflow id");
        }
      } catch {
        toast.error(t("save_error"));
        router.replace("/dashboard/build/workflows");
      }
    })();
  }, [router, t, te]);

  return (
    <p className="text-muted-foreground flex h-[40vh] items-center justify-center text-sm">{te("creating_workflow")}</p>
  );
}
