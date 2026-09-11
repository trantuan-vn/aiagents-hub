"use client";

import { useEffect, useState } from "react";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { cn } from "@/lib/utils";

import { cancelWorkflowExecution } from "../../../_lib/api";

import { WorkflowResizeHandle, workflowResizePanelClassName } from "../../layout/workflow-resize-handle";
import { useWorkflowExecutions } from "./use-workflow-executions";
import { WorkflowExecutionList, WorkflowExecutionListRail } from "./workflow-execution-list";
import { WorkflowExecutionWorkspace } from "./workflow-execution-workspace";

const LIST_COLLAPSED_KEY = "workflow-executions-list-collapsed";

function readListCollapsed(): boolean {
  try {
    return window.localStorage.getItem(LIST_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeListCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(LIST_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}

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
  const [listCollapsed, setListCollapsed] = useState(false);
  const [stoppingKey, setStoppingKey] = useState<string | null>(null);
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

  const onStop = async (executionKey: string) => {
    setStoppingKey(executionKey);
    try {
      await cancelWorkflowExecution(executionKey);
      toast.success(t("executions_stop_done"));
      await load(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("executions_stop_failed"));
    } finally {
      setStoppingKey(null);
    }
  };

  useEffect(() => {
    setListCollapsed(readListCollapsed());
  }, []);

  const collapseList = (collapsed: boolean) => {
    setListCollapsed(collapsed);
    writeListCollapsed(collapsed);
  };

  const workspace = selected ? (
    <WorkflowExecutionWorkspace
      key={selected.executionKey}
      workflowId={workflowId}
      selected={selected}
      graphDefinition={graphDefinition}
      selectedNodeId={selectedNodeId}
      stopping={stoppingKey === selected.executionKey}
      onSelectNode={setSelectedNodeId}
      onApplyDefinition={onApplyDefinition}
      onCopiedToEditor={onCopiedToEditor}
      onReload={() => load(true)}
      onStop={() => void onStop(selected.executionKey)}
    />
  ) : (
    <div className="flex h-full items-center justify-center">
      <p className="text-muted-foreground text-xs">{t("executions_select_run")}</p>
    </div>
  );

  if (listCollapsed) {
    return (
      <div className="flex h-full min-h-0 w-full min-w-0">
        <WorkflowExecutionListRail onExpand={() => collapseList(false)} />
        <div className={cn(workflowResizePanelClassName, "flex-1")}>{workspace}</div>
      </div>
    );
  }

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
        minSize={8}
        maxSize={42}
        collapsible
        collapsedSize={0}
        onCollapse={() => collapseList(true)}
        className={workflowResizePanelClassName}
      >
        <WorkflowExecutionList
          executions={executions}
          loading={loading}
          selectedKey={selectedKey}
          search={search}
          searchOpen={searchOpen}
          autoRefresh={autoRefresh}
          stoppingKey={stoppingKey}
          onSearchChange={setSearch}
          onSearchOpenChange={setSearchOpen}
          onAutoRefreshChange={setAutoRefresh}
          onSelect={setSelectedKey}
          onRefresh={() => void load()}
          onStop={(key) => void onStop(key)}
          onCollapse={() => collapseList(true)}
        />
      </ResizablePanel>
      <WorkflowResizeHandle />
      <ResizablePanel id="workspace" order={2} defaultSize={78} minSize={40} className={workflowResizePanelClassName}>
        {workspace}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
