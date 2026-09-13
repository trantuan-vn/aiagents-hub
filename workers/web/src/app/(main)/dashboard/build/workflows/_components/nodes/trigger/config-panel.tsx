"use client";

import { useCallback } from "react";

import type { Node } from "@xyflow/react";
import { FlaskConical, Lightbulb, MousePointerClick, Zap } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useWorkflowCanvasUi } from "../../canvas/workflow-canvas-ui-context";
import { useWorkflowEditorActions } from "../../editor/workflow-editor-actions-context";
import { WorkflowExecuteStepButton } from "../../node-ui/workflow-execute-step-button";
import { NodeMockOutputSection } from "../../panels/node-config/node-mock-output-section";
import type { NodeConfigPanelProps } from "../types";
import { isGenericManualTriggerLabel } from "./label";

export type ManualTriggerConfigPanelProps = NodeConfigPanelProps;

export function isManualTriggerNode(node: Node): boolean {
  if (node.type !== "trigger") return false;
  const d = (node.data ?? {}) as Record<string, unknown>;
  if (d.triggerKind === "manual") return true;
  if (typeof d.triggerKind === "string") return false;
  if (d.coreKind === "webhook") return false;
  return true;
}

export function ManualTriggerConfigPanel({
  node,
  onClose,
  onPatchData,
  onExecuteStep,
}: ManualTriggerConfigPanelProps) {
  const t = useTranslations("WorkflowNodeRegistry");
  const te = useTranslations("WorkflowEditorPage");
  const ui = useWorkflowCanvasUi();
  const actions = useWorkflowEditorActions();

  const nodeData = (node.data ?? {}) as Record<string, unknown>;
  const storedLabel = String(nodeData.label ?? "").trim();
  const title = isGenericManualTriggerLabel(storedLabel)
    ? te("trigger_manual_node_label")
    : storedLabel || te("trigger_manual_node_label");

  const patch = useCallback(
    (fields: Record<string, unknown>) => onPatchData(node.id, fields),
    [node.id, onPatchData],
  );

  const exploreOtherTriggers = () => {
    onClose();
    ui?.openAddNodeDrawer?.({
      variant: "full",
      initialView: "triggers",
      onPick: ({ type, label, extra }) => {
        actions?.onAddNode(type, label, extra);
      },
    });
  };

  return (
    <div className="bg-background absolute inset-0 z-50 flex flex-col">
      <header className="flex items-center justify-between border-b px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-md bg-[#ff6f00]/10">
            <MousePointerClick className="size-4 text-[#ff6f00]" />
          </div>
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
        <Button type="button" variant="ghost" size="icon" className="size-8" onClick={onClose} aria-label={t("close")}>
          <span className="sr-only">{t("close")}</span>
          <span className="text-lg leading-none">&times;</span>
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(280px,2fr)_3fr]">
        <div className="flex min-h-0 flex-col border-r">
          <Tabs defaultValue="parameters" className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
              <TabsList className="h-8 bg-transparent p-0">
                <TabsTrigger
                  value="parameters"
                  className="data-[state=active]:border-[#ff6f00] data-[state=active]:text-[#ff6f00] rounded-none border-b-2 border-transparent px-3 text-xs shadow-none data-[state=active]:shadow-none"
                >
                  {t("section_parameters")}
                </TabsTrigger>
                <TabsTrigger
                  value="settings"
                  className="data-[state=active]:border-[#ff6f00] data-[state=active]:text-[#ff6f00] rounded-none border-b-2 border-transparent px-3 text-xs shadow-none data-[state=active]:shadow-none"
                >
                  {t("section_settings")}
                </TabsTrigger>
              </TabsList>
              {onExecuteStep ? (
                <WorkflowExecuteStepButton
                  nodeId={node.id}
                  size="sm"
                  className="shrink-0 text-xs"
                  icon={FlaskConical}
                  fillIcon={false}
                  onClick={() => onExecuteStep(node.id)}
                  label={te("menu_execute_step")}
                  executingLabel={te("menu_executing_step")}
                />
              ) : null}
            </div>

            <TabsContent value="parameters" className="mt-0 min-h-0 flex-1 overflow-y-auto p-4">
              <div className="rounded-md border border-[#ff6f00]/25 bg-[#fff4e5] px-3 py-2.5 text-[13px] leading-relaxed text-[#c05621] dark:bg-[#ff6f00]/10 dark:text-[#ffb074]">
                {t.rich("trigger_manual_start_hint", {
                  link: (chunks) => (
                    <button
                      type="button"
                      className="font-medium text-[#ff6f00] underline-offset-2 hover:underline"
                      onClick={exploreOtherTriggers}
                    >
                      {chunks}
                    </button>
                  ),
                })}
              </div>
              <p className="text-foreground mt-4 text-sm">{t("trigger_manual_no_parameters")}</p>
            </TabsContent>
            <TabsContent value="settings" className="mt-0 min-h-0 flex-1 overflow-y-auto p-4">
              <p className="text-muted-foreground text-xs">{t("settings_placeholder")}</p>
            </TabsContent>
          </Tabs>

          <p className="text-muted-foreground flex shrink-0 items-center gap-1.5 border-t px-4 py-2 text-[11px] italic">
            <Lightbulb className="size-3.5 shrink-0" aria-hidden />
            {t("webhook_wish")}
          </p>
        </div>

        <NodeMockOutputSection
          output={nodeData._output}
          outputPinned={!!nodeData._outputPinned}
          defaultMockJson="{}"
          emptyLabel={t("webhook_no_trigger_output")}
          emptyIcon={<Zap className="text-muted-foreground/40 size-10 fill-current stroke-[1.5]" />}
          executeLabel={t("webhook_test_trigger")}
          onSaveOutput={(parsed) => patch({ _output: parsed, _outputPinned: true })}
          onUnpinOutput={() => patch({ _output: undefined, _outputPinned: false })}
          onExecute={onExecuteStep ? () => onExecuteStep(node.id) : undefined}
          executeNodeId={node.id}
          node={node}
        />
      </div>
    </div>
  );
}
