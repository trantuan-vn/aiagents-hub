"use client";

import { useCallback, useMemo } from "react";

import type { Node } from "@xyflow/react";
import { Play, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { resolveNodeDefinition } from "@/lib/workflow-node-registry";

import { useWorkflowNodeRegistry } from "../../hooks/use-workflow-node-registry";
import { NodeConfigFieldRenderer } from "./node-config-field-renderer";
import { NodeConfigIoPanel } from "./node-config-io-panel";

type WorkflowNodeConfigPanelProps = {
  node: Node | null;
  onClose: () => void;
  onPatchData: (nodeId: string, patch: Record<string, unknown>) => void;
  onExecuteStep?: (nodeId: string) => void;
};

export function WorkflowNodeConfigPanel({
  node,
  onClose,
  onPatchData,
  onExecuteStep,
}: WorkflowNodeConfigPanelProps) {
  const t = useTranslations("WorkflowNodeRegistry");
  const te = useTranslations("WorkflowEditorPage");
  const { registry } = useWorkflowNodeRegistry();

  const nodeData = (node?.data ?? {}) as Record<string, unknown>;
  const runtimeType = node?.type ?? "";
  const kind = typeof nodeData.coreKind === "string"
    ? nodeData.coreKind
    : typeof nodeData.flowKind === "string"
      ? nodeData.flowKind
      : typeof nodeData.triggerKind === "string"
        ? nodeData.triggerKind
        : undefined;

  const definition = useMemo(
    () => (runtimeType ? resolveNodeDefinition(runtimeType, kind, registry) : undefined),
    [runtimeType, kind, registry],
  );

  const inputSection = definition?.sections.find((s) => s.id === "input");
  const paramsSection = definition?.sections.find((s) => s.id === "parameters");
  const outputSection = definition?.sections.find((s) => s.id === "output");

  const handleFieldChange = useCallback(
    (fieldId: string, value: unknown) => {
      if (!node) return;
      onPatchData(node.id, { [fieldId]: value });
    },
    [node, onPatchData],
  );

  if (!node || !definition) return null;

  const paramFields = [...(paramsSection?.fields ?? [])].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

  return (
    <div className="bg-background absolute inset-0 z-50 flex flex-col">
      <header className="flex items-center justify-between border-b px-4 py-2">
        <div>
          <h2 className="text-sm font-semibold">{String(nodeData.label ?? te(definition.nameKey))}</h2>
          <p className="text-muted-foreground text-xs">{te(definition.descriptionKey)}</p>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label={t("close")}>
          <X className="h-4 w-4" />
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-3">
        {inputSection ? (
          <NodeConfigIoPanel
            title={t("section_input")}
            section={inputSection}
            data={nodeData}
            emptyLabel={t("no_input_data")}
          />
        ) : null}

        <div className="flex min-h-0 flex-col border-r">
          <div className="border-b px-3 py-2">
            <Tabs defaultValue="parameters">
              <TabsList className="h-8">
                <TabsTrigger value="parameters" className="text-xs">
                  {t("section_parameters")}
                </TabsTrigger>
                <TabsTrigger value="settings" className="text-xs">
                  {t("section_settings")}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="parameters" className="mt-0">
                <div className="max-h-[calc(100vh-12rem)] space-y-4 overflow-y-auto p-3">
                  {onExecuteStep ? (
                    <Button
                      type="button"
                      className="bg-[#ff6f00] hover:bg-[#e66300] w-full text-white"
                      onClick={() => onExecuteStep(node.id)}
                    >
                      <Play className="mr-2 h-4 w-4 fill-current" />
                      {te("menu_execute_step")}
                    </Button>
                  ) : null}
                  {paramFields.map((field) => (
                    <NodeConfigFieldRenderer
                      key={field.id}
                      field={field}
                      value={nodeData[field.id] ?? field.defaultValue}
                      onChange={(v) => handleFieldChange(field.id, v)}
                    />
                  ))}
                </div>
              </TabsContent>
              <TabsContent value="settings" className="mt-0 p-3">
                <p className="text-muted-foreground text-xs">{t("settings_placeholder")}</p>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {outputSection ? (
          <div className="relative flex min-h-0 flex-col">
            <NodeConfigIoPanel
              title={t("section_output")}
              section={outputSection}
              data={(nodeData._output as Record<string, unknown>) ?? {}}
              readOnly
              emptyLabel={t("no_output_data")}
            />
            {outputSection.showExecuteStep && onExecuteStep ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80 p-4 text-center">
                <p className="text-muted-foreground text-sm">{t("no_output_data")}</p>
                <Button
                  type="button"
                  className="bg-[#ff6f00] hover:bg-[#e66300] text-white"
                  onClick={() => onExecuteStep(node.id)}
                >
                  <Play className="mr-2 h-4 w-4 fill-current" />
                  {te("menu_execute_step")}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
