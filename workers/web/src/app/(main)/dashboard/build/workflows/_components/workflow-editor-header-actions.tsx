"use client";

import Link from "next/link";

import { History, MoreHorizontal, Play } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { WorkflowEditorHeaderMoreMenu } from "./workflow-editor-header-more-menu";

const executeButtonClass = "h-8 gap-1 bg-[#ff6f00] text-white hover:bg-[#e66300]";

interface WorkflowEditorHeaderViewActionsProps {
  chatHref?: string;
  onExecute: () => void;
}

export function WorkflowEditorHeaderViewActions({ chatHref, onExecute }: WorkflowEditorHeaderViewActionsProps) {
  const tv = useTranslations("WorkflowViewPage");

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {chatHref ? (
        <Button variant="outline" size="sm" className="h-8" asChild>
          <Link href={chatHref}>{tv("chat")}</Link>
        </Button>
      ) : null}
      <Button size="sm" className={executeButtonClass} onClick={onExecute}>
        <Play className="size-3.5 fill-current" />
        {tv("execute")}
      </Button>
    </div>
  );
}

interface WorkflowEditorHeaderEditActionsProps {
  status: "draft" | "published";
  saving?: boolean;
  publishing?: boolean;
  onPublish: () => void;
  onExecute: () => void;
  onOpenHistory: () => void;
  onEditName: () => void;
  onEditNote: () => void;
  onDuplicate: () => void;
  onDownload: () => void;
  onShare: () => void;
  onFavorite: () => void;
  onImportFile: (file: File) => void;
  onOpenSettings: () => void;
  onDelete: () => void;
}

export function WorkflowEditorHeaderEditActions({
  status,
  saving = false,
  publishing = false,
  onPublish,
  onExecute,
  onOpenHistory,
  onEditName,
  onEditNote,
  onDuplicate,
  onDownload,
  onShare,
  onFavorite,
  onImportFile,
  onOpenSettings,
  onDelete,
}: WorkflowEditorHeaderEditActionsProps) {
  const t = useTranslations("WorkflowsPage");
  const te = useTranslations("WorkflowEditorPage");

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {saving ? (
        <span className="text-muted-foreground hidden text-[10px] sm:inline">{te("saving")}</span>
      ) : null}
      <span
        className={cn(
          "hidden rounded-full px-2 py-0.5 text-[10px] font-medium sm:inline",
          status === "published"
            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
            : "bg-amber-500/15 text-amber-800 dark:text-amber-400",
        )}
      >
        {status === "published" ? t("status_published") : t("status_draft")}
      </span>
      <Button
        size="sm"
        variant={status === "published" ? "outline" : "default"}
        className={cn(status !== "published" && "bg-[#ff6f00] text-white hover:bg-[#e66300]")}
        onClick={onPublish}
        disabled={publishing || status === "published"}
      >
        {publishing ? te("publishing") : te("publish")}
      </Button>
      <Button variant="outline" size="icon" className="size-8" type="button" aria-label={te("history")} onClick={onOpenHistory}>
        <History className="size-3.5" />
      </Button>
      <WorkflowEditorHeaderMoreMenu
        onEditName={onEditName}
        onEditNote={onEditNote}
        onDuplicate={onDuplicate}
        onDownload={onDownload}
        onShare={onShare}
        onFavorite={onFavorite}
        onImportFile={onImportFile}
        onOpenSettings={onOpenSettings}
        onDelete={onDelete}
      />
      <Button size="sm" className={executeButtonClass} onClick={onExecute}>
        <Play className="size-3.5 fill-current" />
        {te("execute")}
      </Button>
    </div>
  );
}
