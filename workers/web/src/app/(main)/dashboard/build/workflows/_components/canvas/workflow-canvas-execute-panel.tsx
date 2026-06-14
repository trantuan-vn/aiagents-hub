"use client";

import { Panel } from "@xyflow/react";
import { Play } from "lucide-react";
import { useTranslations } from "next-intl";

interface WorkflowCanvasExecutePanelProps {
  onExecute: () => void;
}

export function WorkflowCanvasExecutePanel({ onExecute }: WorkflowCanvasExecutePanelProps) {
  const t = useTranslations("WorkflowEditorPage");

  return (
    <Panel position="bottom-center" className="!m-4 !p-0">
      <button
        type="button"
        onClick={onExecute}
        className="bg-[#ff6f00] hover:bg-[#e66300] inline-flex h-10 items-center gap-2 rounded-full px-5 text-sm font-semibold text-white shadow-md transition-colors"
      >
        <Play className="size-4 fill-current" aria-hidden />
        {t("execute_workflow")}
      </button>
    </Panel>
  );
}
