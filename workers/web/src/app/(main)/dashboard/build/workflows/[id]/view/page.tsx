"use client";

import { useEffect, useState } from "react";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";

import { getSharedWorkflowPromoSite, type WorkflowPromoSite } from "../../_lib/api";
import { base64ToBytes, type PromoFolderFile } from "../../_lib/promo-folder";
import { WorkflowPromoFrame } from "../../_components/panels/workflow-panels/workflow-promo-frame";

import "../../_components/canvas/workflow-canvas-theme.css";

function filesFromSite(site: WorkflowPromoSite): PromoFolderFile[] {
  return site.files.map((file) => ({
    path: file.path,
    bytes: base64ToBytes(file.contentBase64),
    contentType: file.contentType,
  }));
}

export default function ViewSharedWorkflowPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = Number(params.id);
  const ownerId = searchParams.get("owner") ?? "";
  const t = useTranslations("WorkflowViewPage");

  const [name, setName] = useState("");
  const [files, setFiles] = useState<PromoFolderFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!id || Number.isNaN(id) || !ownerId) return;
    let cancelled = false;
    setLoading(true);
    setMissing(false);
    getSharedWorkflowPromoSite(ownerId, id)
      .then((res) => {
        if (cancelled) return;
        setName(res.workflow.name);
        setFiles(res.site ? filesFromSite(res.site) : []);
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, ownerId]);

  if (!id || Number.isNaN(id) || !ownerId) {
    return <p className="text-muted-foreground p-6 text-sm">{t("invalid")}</p>;
  }

  return (
    <div className="workflow-editor-shell -mx-4 -mt-4 -mb-4 flex flex-col md:-mx-6 md:-mt-6 md:-mb-6">
      <header className="border-border bg-background flex h-12 shrink-0 items-center gap-3 border-b px-3">
        <Link
          href="/dashboard/build/workflows?view=shared"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-4" />
          {t("back")}
        </Link>
        <div className="bg-border h-4 w-px" />
        <h1 className="min-w-0 truncate text-sm font-medium">{name || t("intro_label")}</h1>
        <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-medium">
          {t("intro_label")}
        </span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col p-4">
        {loading ? (
          <p className="text-muted-foreground text-sm">{t("intro_loading")}</p>
        ) : missing ? (
          <p className="text-muted-foreground text-sm">{t("intro_error")}</p>
        ) : (
          <WorkflowPromoFrame
            files={files}
            address={name || t("intro_label")}
            emptyLabel={t("intro_empty")}
            title={name || t("intro_label")}
          />
        )}
      </div>
    </div>
  );
}
