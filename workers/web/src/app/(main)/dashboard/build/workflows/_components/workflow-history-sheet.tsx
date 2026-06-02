"use client";

import { History } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import { WorkflowVersionsPanel } from "./workflow-versions-panel";

interface WorkflowHistorySheetProps {
  workflowId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplyDefinition?: (definitionJson: string) => void;
}

export function WorkflowHistorySheet({
  workflowId,
  open,
  onOpenChange,
  onApplyDefinition,
}: WorkflowHistorySheetProps) {
  const t = useTranslations("WorkflowEditorPage");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b px-4 py-3 text-left">
          <SheetTitle className="flex items-center gap-2 text-sm">
            <History className="size-4" />
            {t("history")}
          </SheetTitle>
          <SheetDescription className="text-xs">{t("versions_description")}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1">
          <WorkflowVersionsPanel workflowId={workflowId} onApplyDefinition={onApplyDefinition} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
