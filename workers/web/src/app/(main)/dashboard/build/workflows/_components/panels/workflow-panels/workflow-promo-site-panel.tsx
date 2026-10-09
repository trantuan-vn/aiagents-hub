"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FolderUp, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  deleteWorkflowPromoSite,
  getWorkflowPromoSite,
  publishWorkflowPromoSite,
  type WorkflowPromoSite,
} from "../../../_lib/api";
import {
  base64ToBytes,
  bytesToBase64,
  formatPromoBytes,
  normalizePromoFolder,
  promoFilesFromDataTransfer,
  promoFilesFromList,
  type PromoFolderError,
  type PromoFolderFile,
} from "../../../_lib/promo-folder";

import { WorkflowPromoFrame } from "./workflow-promo-frame";

function filesFromSite(site: WorkflowPromoSite): PromoFolderFile[] {
  return site.files.map((file) => ({
    path: file.path,
    bytes: base64ToBytes(file.contentBase64),
    contentType: file.contentType,
  }));
}

export function WorkflowPromoSitePanel({ workflowId }: { workflowId: number }) {
  const t = useTranslations("WorkflowEditorPage");
  const inputRef = useRef<HTMLInputElement>(null);
  const [published, setPublished] = useState<PromoFolderFile[] | null>(null);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [draft, setDraft] = useState<PromoFolderFile[] | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [removing, setRemoving] = useState(false);

  const preview = draft ?? published ?? [];
  const totalBytes = useMemo(() => preview.reduce((sum, file) => sum + file.bytes.byteLength, 0), [preview]);

  const explain = useCallback(
    (error: PromoFolderError) => {
      if (error === "missing_index") return t("promo_missing_index");
      if (error === "too_large") return t("promo_too_large");
      if (error === "too_many") return t("promo_too_many");
      if (error === "empty") return t("promo_missing_index");
      return t("promo_bad_file");
    },
    [t],
  );

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.setAttribute("webkitdirectory", "");
    input.setAttribute("directory", "");
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getWorkflowPromoSite(workflowId)
      .then((res) => {
        if (cancelled) return;
        setPublished(res.site ? filesFromSite(res.site) : []);
        setPublishedAt(res.site?.updatedAt ?? null);
      })
      .catch(() => {
        if (!cancelled) toast.error(t("promo_load_error"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t, workflowId]);

  const takeFiles = useCallback(
    (raw: Array<{ path: string; bytes: Uint8Array }>) => {
      const normalized = normalizePromoFolder(raw);
      if (!normalized.ok) {
        toast.error(explain(normalized.error));
        return;
      }
      setDraft(normalized.files);
    },
    [explain],
  );

  const onDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    try {
      takeFiles(await promoFilesFromDataTransfer(event.dataTransfer));
    } catch {
      toast.error(t("promo_bad_file"));
    }
  };

  const publish = async () => {
    if (!draft) return;
    setPublishing(true);
    try {
      const result = await publishWorkflowPromoSite(
        workflowId,
        draft.map((file) => ({ path: file.path, contentBase64: bytesToBase64(file.bytes) })),
      );
      setPublished(draft);
      setPublishedAt(result.site.updatedAt);
      setDraft(null);
      toast.success(t("promo_saved"));
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      toast.error(
        code === "missing_index" || code === "too_large" || code === "too_many" || code === "bad_file" || code === "empty"
          ? explain(code)
          : t("promo_save_error"),
      );
    } finally {
      setPublishing(false);
    }
  };

  const remove = async () => {
    setRemoving(true);
    try {
      await deleteWorkflowPromoSite(workflowId);
      setPublished([]);
      setPublishedAt(null);
      setDraft(null);
      toast.success(t("promo_removed"));
    } catch {
      toast.error(t("promo_remove_error"));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <div className="grid h-full min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[22rem_minmax(0,1fr)] lg:overflow-hidden lg:p-6">
        <section className="flex min-h-0 flex-col gap-4 lg:overflow-y-auto">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">{t("promo_title")}</h2>
            <p className="text-muted-foreground mt-1 text-sm">{t("promo_subtitle")}</p>
          </div>

          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                inputRef.current?.click();
              }
            }}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => void onDrop(event)}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center transition-colors",
              dragging ? "border-primary bg-primary/5" : "border-border bg-muted/30 hover:bg-muted/60",
            )}
          >
            <span className="bg-background flex size-12 items-center justify-center rounded-full border shadow-sm">
              <FolderUp className="size-5" />
            </span>
            <span className="text-sm font-medium">{draft ? t("promo_replace") : t("promo_drop_title")}</span>
            <span className="text-muted-foreground max-w-xs text-xs">{t("promo_drop_hint")}</span>
            <span className="text-xs font-medium underline underline-offset-2">{t("promo_browse")}</span>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => {
                const list = event.target.files;
                event.target.value = "";
                if (!list || list.length === 0) return;
                void promoFilesFromList(list)
                  .then(takeFiles)
                  .catch(() => toast.error(t("promo_bad_file")));
              }}
            />
          </div>

          <div className="bg-muted/20 min-h-0 flex-1 rounded-xl border p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-medium">
                {preview.length > 0 ? t("promo_files", { count: preview.length, size: formatPromoBytes(totalBytes) }) : t("promo_file_heading")}
              </p>
              {draft ? (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                  {t("promo_draft")}
                </span>
              ) : published && published.length > 0 ? (
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                  {t("promo_published")}
                </span>
              ) : null}
            </div>
            {loading ? (
              <p className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader2 className="size-3.5 animate-spin" />
                {t("promo_loading")}
              </p>
            ) : preview.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("promo_no_files")}</p>
            ) : (
              <ul className="max-h-48 space-y-1 overflow-y-auto pr-1 lg:max-h-none">
                {preview.map((file) => (
                  <li key={file.path} className="flex items-center justify-between gap-3 text-xs">
                    <span className="truncate font-mono">{file.path}</span>
                    <span className="text-muted-foreground shrink-0 tabular-nums">{formatPromoBytes(file.bytes.byteLength)}</span>
                  </li>
                ))}
              </ul>
            )}
            {publishedAt && !draft ? (
              <p className="text-muted-foreground mt-3 text-[11px]">
                {t("promo_updated", { time: new Date(publishedAt).toLocaleString() })}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={!draft || publishing} onClick={() => void publish()}>
              {publishing ? t("promo_publishing") : t("promo_publish")}
            </Button>
            {draft ? (
              <Button type="button" variant="outline" disabled={publishing} onClick={() => setDraft(null)}>
                {t("promo_discard")}
              </Button>
            ) : null}
            {published && published.length > 0 ? (
              <Button type="button" variant="outline" disabled={removing || publishing} onClick={() => void remove()}>
                <Trash2 />
                {removing ? t("promo_removing") : t("promo_remove")}
              </Button>
            ) : null}
          </div>

          <p className="text-muted-foreground flex items-start gap-2 text-xs">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
            <span>{t("promo_community_note")}</span>
          </p>
        </section>

        <WorkflowPromoFrame
          files={preview}
          address={t("promo_preview_label")}
          emptyLabel={t("promo_empty_preview")}
          title={t("promo_title")}
        />
      </div>
    </div>
  );
}
