"use client";

import { useState } from "react";

import { useTranslations } from "next-intl";

import { ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

import { WorkflowResizeHandle, workflowResizePanelClassName } from "../../layout/workflow-resize-handle";
import { useWorkflowExecutions } from "./use-workflow-executions";
import { WorkflowExecutionList } from "./workflow-execution-list";
import { WorkflowExecutionWorkspace } from "./workflow-execution-workspace";

interface WorkflowExecutionsPanelProps {
  workflowId: number;
  fallbackDefinitionJson?: string;
  onApplyDefinition?: (definitionJson: string) => void;
  onCopiedToEditor?: () => void;
}

export function WorkflowExecutionsPanel({
  workflowId,
  fallbackDefinitionJson,
  onApplyDefinition,
  onCopiedToEditor,
}: WorkflowExecutionsPanelProps) {
  const t = useTranslations("WorkflowEditorPage");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const {
    executions,
    loading,
    selected,
    selectedKey,
    setSelectedKey,
    selectedNodeId,
    setSelectedNodeId,
    autoRefresh,
    setAutoRefresh,
    load,
    graphDefinition,
  } = useWorkflowExecutions(workflowId, fallbackDefinitionJson);

  return (
    <ResizablePanelGroup
      direction="horizontal"
      autoSaveId="workflow-executions-list-v2"
      className="h-full min-h-0 w-full"
    >
      <ResizablePanel
        id="list"
        order={1}
        defaultSize={22}
        minSize={14}
        maxSize={42}
        className={workflowResizePanelClassName}
      >
        <WorkflowExecutionList
          executions={executions}
          loading={loading}
          selectedKey={selectedKey}
          search={search}
          searchOpen={searchOpen}
          autoRefresh={autoRefresh}
          onSearchChange={setSearch}
          onSearchOpenChange={setSearchOpen}
          onAutoRefreshChange={setAutoRefresh}
          onSelect={setSelectedKey}
          onRefresh={() => void load()}
        />
      </ResizablePanel>
      <WorkflowResizeHandle />
      <ResizablePanel id="workspace" order={2} defaultSize={78} minSize={40} className={workflowResizePanelClassName}>
        {selected ? (
          <WorkflowExecutionWorkspace
            workflowId={workflowId}
            selected={selected}
            graphDefinition={graphDefinition}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            onApplyDefinition={onApplyDefinition}
            onCopiedToEditor={onCopiedToEditor}
            onReload={() => load(true)}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-muted-foreground text-xs">{t("executions_select_run")}</p>
          </div>
        )}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
