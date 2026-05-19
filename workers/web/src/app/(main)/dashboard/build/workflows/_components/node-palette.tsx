"use client";

import { Bot, GitBranch, Layers, Play, UserCheck, Wrench, Zap } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

const PALETTE = [
  { type: "trigger", icon: Play, key: "node_trigger" as const },
  { type: "agent", icon: Bot, key: "node_agent" as const },
  { type: "human_review", icon: UserCheck, key: "node_human_review" as const },
  { type: "flow", icon: GitBranch, key: "node_flow" as const },
  { type: "core", icon: Layers, key: "node_core" as const },
  { type: "action_in_app", icon: Zap, key: "node_action" as const },
  { type: "data_transformation", icon: Wrench, key: "node_transform" as const },
];

interface NodePaletteProps {
  onAdd: (type: string, label: string) => void;
}

export function NodePalette({ onAdd }: NodePaletteProps) {
  const t = useTranslations("WorkflowEditorPage");

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">{t("palette")}</p>
      {PALETTE.map(({ type, icon: Icon, key }) => (
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
