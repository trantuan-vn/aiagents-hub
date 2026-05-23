"use client";

import Link from "next/link";

import { ChevronDown, History, MoreHorizontal, Play, Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

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
  saving: boolean;
  onSave?: () => void;
  onExecute: () => void;
  onOpenSettings?: () => void;
}

export function WorkflowEditorHeaderEditActions({
  status,
  saving,
  onSave,
  onExecute,
  onOpenSettings,
}: WorkflowEditorHeaderEditActionsProps) {
  const t = useTranslations("WorkflowsPage");
  const te = useTranslations("WorkflowEditorPage");

  return (
    <div className="flex shrink-0 items-center gap-1.5">
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" className={executeButtonClass}>
            {te("publish")}
            <ChevronDown className="size-3.5 opacity-80" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => void onSave?.()} disabled={saving}>
            {saving ? te("saving") : te("save")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onExecute}>{te("execute")}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="outline" size="icon" className="size-8" type="button" aria-label={te("history")}>
        <History className="size-3.5" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="size-8">
            <MoreHorizontal className="size-3.5" />
            <span className="sr-only">{te("more_menu")}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onOpenSettings}>
            <Settings2 className="mr-2 size-3.5" />
            {te("settings_title")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
