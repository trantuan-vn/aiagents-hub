"use client";

import { useCallback, useMemo, useState } from "react";

import { ArrowLeftFromLine } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  CODE_JS_MODE_ALL,
  CODE_JS_MODE_EACH,
  codeJsSourceForMode,
  isCodeJsStarter,
} from "@aiagents-hub/workflow-nodes";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { isDataFlowEdge } from "../../edges/workflow-connection-utils";
import { WorkflowExecuteStepButton } from "../../node-ui/workflow-execute-step-button";
import { AgentUpstreamInputPanel } from "../../panels/node-config/agent-upstream-input-panel";
import { NodeMockOutputSection } from "../../panels/node-config/node-mock-output-section";
import type { NodeConfigPanelProps } from "../types";
import { JsCodeEditor } from "./js-code-editor";

const ORANGE = "bg-[#ff6f00] hover:bg-[#e66300]";

function CodeBracesMark() {
  return (
    <svg viewBox="0 0 24 18" className="size-4 text-[#f5a524]" fill="none" aria-hidden>
      <path
        d="M9 2c-2.4 0-3.6 1.3-3.6 3.5V7.4c0 1.2-.6 1.8-1.8 1.8H2.6v1.2h1c1.2 0 1.8.6 1.8 1.8v1.9C5.4 14.7 6.6 16 9 16"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M15 2c2.4 0 3.6 1.3 3.6 3.5V7.4c0 1.2.6 1.8 1.8 1.8h1v1.2h-1c-1.2 0-1.8.6-1.8 1.8v1.9c0 2.2-1.2 3.5-3.6 3.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CodeNodeConfigPanel({
  node,
  nodes = [],
  edges = [],
  onClose,
  onPatchData,
  onExecuteStep,
}: NodeConfigPanelProps) {
  const t = useTranslations("WorkflowNodeRegistry");
  const te = useTranslations("WorkflowEditorPage");
  const nodeData = (node.data ?? {}) as Record<string, unknown>;
  const [tab, setTab] = useState<"parameters" | "settings">("parameters");

  const mode = String(nodeData.mode ?? CODE_JS_MODE_ALL);
  const jsCode = String(nodeData.jsCode ?? codeJsSourceForMode(mode));
  const notes = String(nodeData.notes ?? "");
  const continueOnFail = nodeData.continueOnFail === true;

  const patch = useCallback(
    (fields: Record<string, unknown>) => onPatchData(node.id, fields),
    [node.id, onPatchData],
  );

  const upstreamNodeId = useMemo(() => {
    const edge = edges.find((item) => item.target === node.id && isDataFlowEdge(item));
    return edge?.source ?? null;
  }, [edges, node.id]);

  const executePrevious = () => {
    if (upstreamNodeId && onExecuteStep) {
      onExecuteStep(upstreamNodeId);
      return;
    }
    toast.message(t("code_no_upstream"));
  };

  const suggestionDetails = {
    all: t("code_var_input_all"),
    first: t("code_var_input_first"),
    last: t("code_var_input_last"),
    item: t("code_var_input_item"),
    itemJson: t("code_var_item_json"),
    json: t("code_var_json"),
    index: t("code_var_index"),
  };

  return (
    <div className="bg-background absolute inset-0 z-50 flex flex-col">
      <header className="flex items-center justify-between border-b px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-md bg-[#f5a524]/15">
            <CodeBracesMark />
          </div>
          <h2 className="truncate text-sm font-semibold">{String(nodeData.label ?? te("code_in_javascript"))}</h2>
        </div>
        <Button type="button" variant="ghost" size="icon" className="size-8" onClick={onClose} aria-label={t("close")}>
          <span className="text-lg leading-none">&times;</span>
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)_minmax(0,0.9fr)]">
        <div className="flex min-h-0 flex-col border-b lg:border-r lg:border-b-0">
          <AgentUpstreamInputPanel
            nodeId={node.id}
            nodes={nodes}
            edges={edges}
            className="border-r-0"
            onExecutePrevious={onExecuteStep ? executePrevious : undefined}
            executePreviousLabel={t("agent_execute_previous")}
            emptyHint={
              <div className="flex flex-col items-center gap-3 px-2 py-8 text-center">
                <ArrowLeftFromLine className="text-muted-foreground/40 size-10 stroke-[1.5]" />
                <p className="text-sm font-semibold">{t("no_input_data")}</p>
                {onExecuteStep ? (
                  <Button type="button" className={cn(ORANGE, "text-white")} onClick={executePrevious}>
                    {t("agent_execute_previous")}
                  </Button>
                ) : null}
                <p className="text-muted-foreground text-xs">{t("code_input_hint")}</p>
              </div>
            }
          />
        </div>

        <div className="flex min-h-0 flex-col border-b lg:border-r lg:border-b-0">
          <div className="flex items-center gap-3 border-b px-3">
            <button
              type="button"
              className={cn(
                "border-b-2 px-1 py-2.5 text-sm",
                tab === "parameters" ? "border-[#ff6f00] font-medium text-foreground" : "text-muted-foreground border-transparent",
              )}
              onClick={() => setTab("parameters")}
            >
              {t("section_parameters")}
            </button>
            <button
              type="button"
              className={cn(
                "border-b-2 px-1 py-2.5 text-sm",
                tab === "settings" ? "border-[#ff6f00] font-medium text-foreground" : "text-muted-foreground border-transparent",
              )}
              onClick={() => setTab("settings")}
            >
              {t("section_settings")}
            </button>
            {onExecuteStep ? (
              <WorkflowExecuteStepButton
                nodeId={node.id}
                size="sm"
                className="ml-auto"
                onClick={() => onExecuteStep(node.id)}
                label={te("menu_execute_step")}
                executingLabel={te("menu_executing_step")}
              />
            ) : null}
          </div>

          {tab === "parameters" ? (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              <div className="space-y-1.5">
                <Label>{t("code_mode")}</Label>
                <Select
                  value={mode === CODE_JS_MODE_EACH ? CODE_JS_MODE_EACH : CODE_JS_MODE_ALL}
                  onValueChange={(next) => {
                    const patchFields: Record<string, unknown> = { mode: next, language: "javascript" };
                    if (isCodeJsStarter(jsCode)) patchFields.jsCode = codeJsSourceForMode(next);
                    patch(patchFields);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={CODE_JS_MODE_ALL}>{t("code_mode_all")}</SelectItem>
                    <SelectItem value={CODE_JS_MODE_EACH}>{t("code_mode_each")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>{t("code_language")}</Label>
                <Select value="javascript">
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="javascript">{t("code_language_javascript")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <JsCodeEditor
                  value={jsCode}
                  onChange={(next) => patch({ jsCode: next, language: "javascript" })}
                  suggestionDetails={suggestionDetails}
                  checkLabel={t("code_check")}
                  checkOkLabel={t("code_check_ok")}
                  checkEmptyLabel={t("code_check_empty")}
                  checkErrorLabel={t("code_check_error")}
                />
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950">
                  {t("code_special_vars_hint")}
                </p>
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">{t("code_continue_on_fail")}</p>
                  <p className="text-muted-foreground text-xs">{t("code_continue_on_fail_desc")}</p>
                </div>
                <Switch checked={continueOnFail} onCheckedChange={(checked) => patch({ continueOnFail: checked })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="code-notes">{t("code_notes")}</Label>
                <Textarea
                  id="code-notes"
                  value={notes}
                  onChange={(e) => patch({ notes: e.target.value })}
                  placeholder={t("code_notes_placeholder")}
                  className="min-h-28"
                />
              </div>
            </div>
          )}
        </div>

        <NodeMockOutputSection
          output={nodeData._output}
          outputPinned={!!nodeData._outputPinned}
          onSaveOutput={(parsed) => onPatchData(node.id, { _output: parsed, _outputPinned: true })}
          onUnpinOutput={() => onPatchData(node.id, { _output: undefined, _outputPinned: false })}
          onExecute={onExecuteStep ? () => onExecuteStep(node.id) : undefined}
          executeNodeId={node.id}
          node={node}
        />
      </div>
    </div>
  );
}
