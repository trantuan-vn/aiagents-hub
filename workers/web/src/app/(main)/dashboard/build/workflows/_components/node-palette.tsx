"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

import { WORKFLOW_NODE_PALETTE } from "./workflow-node-palette";

interface NodePaletteProps {
  onAdd: (type: string, label: string) => void;
}

export function NodePalette({ onAdd }: NodePaletteProps) {
  const t = useTranslations("WorkflowEditorPage");

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
