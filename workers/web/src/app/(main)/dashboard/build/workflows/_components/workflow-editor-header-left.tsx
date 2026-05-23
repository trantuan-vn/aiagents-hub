"use client";

import type { ReactNode } from "react";

import Link from "next/link";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

interface WorkflowEditorHeaderLeftProps {
  workflowName: string;
  readOnly: boolean;
  backHref: string;
  backLabel: string;
  headerMeta?: ReactNode;
}

export function WorkflowEditorHeaderLeft({
  workflowName,
  readOnly,
  backHref,
  backLabel,
  headerMeta,
}: WorkflowEditorHeaderLeftProps) {
  const te = useTranslations("WorkflowEditorPage");

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <Button variant="ghost" size="sm" className="text-muted-foreground h-8 shrink-0 px-2 text-xs" asChild>
        <Link href={backHref}>{backLabel}</Link>
      </Button>
      <span className="text-muted-foreground shrink-0 text-xs">/</span>
      <span className="truncate text-sm font-medium">{workflowName || te("untitled")}</span>
      {readOnly ? (
        <span className="bg-muted text-muted-foreground hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium sm:inline">
          {te("view_readonly")}
        </span>
      ) : (
        <Button variant="ghost" size="sm" className="text-muted-foreground h-7 shrink-0 gap-1 px-2 text-xs">
          <Plus className="size-3" />
          {te("add_tag")}
        </Button>
      )}
      {headerMeta ? <div className="hidden min-w-0 items-center gap-2 lg:flex">{headerMeta}</div> : null}
    </div>
  );
}
