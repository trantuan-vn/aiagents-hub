"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useTranslations } from "next-intl";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface WorkflowEditorLogsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
}

export function WorkflowEditorLogsPanel({ open, onOpenChange, className }: WorkflowEditorLogsPanelProps) {
  const t = useTranslations("WorkflowEditorPage");

  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      className={cn("border-border bg-background shrink-0 border-t", className)}
    >
      <div className="flex h-9 items-center justify-between px-3">
        <CollapsibleTrigger className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs font-medium transition-colors">
          {open ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
          {t("logs_title")}
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div className="text-muted-foreground flex h-28 items-center justify-center border-t px-4 text-center text-sm">
          {t("logs_empty")}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
