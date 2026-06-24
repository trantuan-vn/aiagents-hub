"use client";

import { useState, type ReactNode } from "react";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { JsonCodeEditor } from "./json-code-editor";
import { NodeOutputPanel } from "./node-output-panel";

const ORANGE = "bg-[#ff6f00] hover:bg-[#e66300]";

export type NodeMockOutputSectionProps = {
  output: unknown;
  outputPinned?: boolean;
  onSaveOutput: (output: unknown) => void;
  onUnpinOutput?: () => void;
  onExecute?: () => void;
  executeLabel?: string;
  emptyLabel?: string;
  defaultMockJson?: string;
  className?: string;
  headerExtra?: ReactNode;
};

export function hasOutputData(output: unknown): output is Record<string, unknown> {
  if (output == null || typeof output !== "object") return false;
  if (Array.isArray(output)) return output.length > 0;
  return Object.keys(output).length > 0;
}

export function NodeMockOutputSection({
  output,
  outputPinned,
  onSaveOutput,
  onUnpinOutput,
  onExecute,
  executeLabel,
  emptyLabel,
  defaultMockJson = '{\n  "text": "Hello"\n}',
  className,
  headerExtra,
}: NodeMockOutputSectionProps) {
  const t = useTranslations("WorkflowNodeRegistry");
  const [editingOutput, setEditingOutput] = useState(false);
  const [outputDraft, setOutputDraft] = useState("");

  const openEditOutput = () => {
    setOutputDraft(hasOutputData(output) ? JSON.stringify(output, null, 2) : defaultMockJson);
    setEditingOutput(true);
  };

  const saveOutput = () => {
    try {
      const parsed = JSON.parse(outputDraft) as unknown;
      onSaveOutput(parsed);
      setEditingOutput(false);
      toast.success(t("agent_mock_saved"));
    } catch {
      toast.error(t("webhook_edit_output_invalid_json"));
    }
  };

  if (editingOutput) {
    return (
      <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
        <div className="flex items-center justify-between border-b px-3 py-2">
          <h3 className="text-xs font-medium">{t("field_mock_output")}</h3>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setEditingOutput(false)}>
              {t("close")}
            </Button>
            <Button type="button" size="sm" className={cn(ORANGE, "h-8 text-xs text-white")} onClick={saveOutput}>
              {t("agent_save_mock")}
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 p-2">
          <JsonCodeEditor value={outputDraft} onChange={setOutputDraft} className="h-full min-h-[200px]" />
        </div>
      </div>
    );
  }

  return (
    <NodeOutputPanel
      data={hasOutputData(output) ? output : null}
      onEdit={openEditOutput}
      onUnpin={outputPinned && onUnpinOutput ? onUnpinOutput : undefined}
      onExecute={onExecute}
      onSetMockData={openEditOutput}
      executeLabel={executeLabel}
      emptyLabel={emptyLabel}
      className={className}
      headerExtra={headerExtra}
    />
  );
}
