"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  collectScheduleCronExprs,
  defaultScheduleRule,
  normalizeScheduleRule,
  parseScheduleRules,
  type ScheduleRule,
} from "@aiagents-hub/workflow-nodes";
import type { Node } from "@xyflow/react";
import { ChevronDown, Clock, FlaskConical, Lightbulb, Plus, Trash2, Zap } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import { WorkflowExecuteStepButton } from "../../node-ui/workflow-execute-step-button";
import { NodeMockOutputSection } from "../../panels/node-config/node-mock-output-section";
import type { NodeConfigPanelProps } from "../types";
import { isGenericScheduleTriggerLabel } from "./label";
import { ScheduleRuleFields } from "./schedule-rule-fields";
import { syncNodeCronTriggers } from "./sync-schedule-cron";

const DEFAULT_MOCK_JSON = `{
  "timestamp": 0,
  "Readable date": "January 1, 2026, 12:00:00 am",
  "Readable time": "12:00:00 am",
  "Day of week": "Thursday",
  "Year": "2026",
  "Month": "January",
  "Day of month": "01",
  "Hour": "00",
  "Minute": "00",
  "Second": "00",
  "Timezone": "UTC"
}`;

export type ScheduleTriggerConfigPanelProps = NodeConfigPanelProps;

export function isScheduleTriggerNode(node: Node): boolean {
  if (node.type !== "trigger") return false;
  const data = (node.data ?? {}) as Record<string, unknown>;
  return data.triggerKind === "schedule";
}

export function ScheduleTriggerConfigPanel({
  node,
  workflowId,
  onClose,
  onPatchData,
  onExecuteStep,
}: ScheduleTriggerConfigPanelProps) {
  const t = useTranslations("WorkflowNodeRegistry");
  const te = useTranslations("WorkflowEditorPage");

  const nodeData = (node.data ?? {}) as Record<string, unknown>;
  const storedLabel = String(nodeData.label ?? "").trim();
  const title = isGenericScheduleTriggerLabel(storedLabel)
    ? te("trigger_schedule_node_label")
    : storedLabel || te("trigger_schedule_node_label");

  const rules = useMemo(() => parseScheduleRules(nodeData.scheduleRules), [nodeData.scheduleRules]);
  const [openRules, setOpenRules] = useState<Record<number, boolean>>({ 0: true });
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cronKey = useMemo(() => collectScheduleCronExprs(rules).join("|"), [rules]);

  const patch = useCallback(
    (fields: Record<string, unknown>) => onPatchData(node.id, fields),
    [node.id, onPatchData],
  );

  const commitRules = useCallback(
    (next: ScheduleRule[]) => {
      const normalized = next.map(normalizeScheduleRule);
      patch({
        scheduleRules: normalized,
        cronExpr: collectScheduleCronExprs(normalized)[0] ?? "0 0 * * *",
      });
    },
    [patch],
  );

  const updateRule = (index: number, partial: Partial<ScheduleRule>) => {
    commitRules(rules.map((rule, i) => (i === index ? { ...rule, ...partial } : rule)));
  };

  const addRule = () => {
    setOpenRules((prev) => ({ ...prev, [rules.length]: true }));
    commitRules([...rules, defaultScheduleRule()]);
  };

  const removeRule = (index: number) => {
    if (rules.length <= 1) return;
    commitRules(rules.filter((_, i) => i !== index));
    setOpenRules((prev) => {
      const next: Record<number, boolean> = {};
      for (const [key, open] of Object.entries(prev)) {
        const from = Number(key);
        if (from === index) continue;
        next[from > index ? from - 1 : from] = open;
      }
      return next;
    });
  };

  useEffect(() => {
    if (!workflowId || Number.isNaN(workflowId)) return;
    const exprs = cronKey ? cronKey.split("|").filter(Boolean) : ["0 0 * * *"];
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      void syncNodeCronTriggers(workflowId, node.id, exprs);
    }, 400);
    return () => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
    };
  }, [cronKey, node.id, workflowId]);

  return (
    <div className="bg-background absolute inset-0 z-50 flex flex-col">
      <header className="flex items-center justify-between border-b px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-md bg-[#ff6f00]/10">
            <Clock className="size-4 text-[#ff6f00]" />
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
                {t("trigger_schedule_start_hint")}
              </div>

              <div className="mt-5 flex items-center justify-between">
                <p className="text-sm font-medium">{t("trigger_schedule_rules")}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={addRule}
                  aria-label={t("trigger_schedule_add_rule")}
                >
                  <Plus className="size-4" />
                </Button>
              </div>

              <div className="mt-2 space-y-3">
                {rules.map((rule, index) => (
                  <ScheduleRuleCard
                    key={index}
                    index={index}
                    rule={rule}
                    open={openRules[index] !== false}
                    canRemove={rules.length > 1}
                    onOpenChange={(next) => setOpenRules((prev) => ({ ...prev, [index]: next }))}
                    onChange={(partial) => updateRule(index, partial)}
                    onRemove={() => removeRule(index)}
                  />
                ))}
              </div>

              <button
                type="button"
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[#ff6f00] hover:underline"
                onClick={addRule}
              >
                <Plus className="size-3.5" />
                {t("trigger_schedule_add_rule")}
              </button>
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
          defaultMockJson={DEFAULT_MOCK_JSON}
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

function ScheduleRuleCard({
  index,
  rule,
  open,
  canRemove,
  onOpenChange,
  onChange,
  onRemove,
}: {
  index: number;
  rule: ScheduleRule;
  open: boolean;
  canRemove: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (partial: Partial<ScheduleRule>) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("WorkflowNodeRegistry");
  return (
    <div className="rounded-md border">
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <div className="flex items-center gap-1 px-2 py-1.5">
          <CollapsibleTrigger className="hover:bg-muted flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left text-sm">
            <ChevronDown
              className={cn("text-muted-foreground size-4 shrink-0 transition-transform", !open && "-rotate-90")}
              aria-hidden
            />
            <span className="truncate font-medium">{t("trigger_schedule_interval_n", { n: index + 1 })}</span>
          </CollapsibleTrigger>
          {canRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground size-7"
              onClick={onRemove}
              aria-label={t("trigger_schedule_remove_rule")}
            >
              <Trash2 className="size-3.5" />
            </Button>
          ) : null}
        </div>
        <CollapsibleContent className="border-t px-3 py-3">
          <ScheduleRuleFields rule={rule} onChange={onChange} />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
