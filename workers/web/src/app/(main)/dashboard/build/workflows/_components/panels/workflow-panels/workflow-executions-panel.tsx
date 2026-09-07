"use client";

import { useState } from "react";

import { useTranslations } from "next-intl";

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
    <div className="flex h-full min-h-0 w-full overflow-hidden">
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
        <div className="flex flex-1 items-center justify-center">
          <p className="text-muted-foreground text-xs">{t("executions_select_run")}</p>
        </div>
      )}
    </div>
  );
}
