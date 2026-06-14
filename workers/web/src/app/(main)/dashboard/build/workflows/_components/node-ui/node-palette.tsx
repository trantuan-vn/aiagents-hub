"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { WORKFLOW_NODE_PALETTE } from "../catalogs/workflow-node-palette";

interface NodePaletteProps {
  onAdd: (type: string, label: string, extra?: Record<string, unknown>) => void;
  compact?: boolean;
}

export function NodePalette({ onAdd, compact }: NodePaletteProps) {
  const t = useTranslations("WorkflowEditorPage");

  if (compact) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="size-8">
            <Plus className="size-3.5" />
            <span className="sr-only">{t("add_node")}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {WORKFLOW_NODE_PALETTE.map(({ type, icon: Icon, key }) => (
            <DropdownMenuItem key={type} onClick={() => onAdd(type, t(key))}>
              <Icon className="mr-2 size-4" />
              {t(key)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">{t("palette")}</p>
      {WORKFLOW_NODE_PALETTE.map(({ type, icon: Icon, key }) => (
        <Button
          key={type}
          type="button"
          variant="outline"
          size="sm"
          className="justify-start gap-2"
          onClick={() => onAdd(type, t(key))}
        >
          <Icon className="h-4 w-4 shrink-0" />
          {t(key)}
        </Button>
      ))}
    </div>
  );
}
