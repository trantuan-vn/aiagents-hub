"use client";

import { useCallback, useMemo } from "react";

import { WorkflowCanvas, type WorkflowDefinition } from "../canvas/workflow-canvas";
import { normalizeWorkflowEdge } from "../edges/workflow-edge-utils";

interface WorkflowEditorProps {
  definitionJson: string;
  definitionSyncKey?: number;
  onDefinitionChange?: (json: string) => void;
  readOnly?: boolean;
  serviceEndpoint?: string;
  workflowId?: number;
  onExecute?: () => void;
  className?: string;
}

function parseDef(json: string): WorkflowDefinition {
  try {
    const p = JSON.parse(json) as Partial<WorkflowDefinition> & { nodes?: unknown; edges?: unknown };
    const nodes = Array.isArray(p.nodes) ? p.nodes : [];
    const edges = (Array.isArray(p.edges) ? p.edges : []).map((e) => normalizeWorkflowEdge(e));
    return { nodes, edges, viewport: p.viewport };
  } catch {
    return { nodes: [], edges: [] };
  }
}

export function WorkflowEditor({
  definitionJson,
  definitionSyncKey,
  onDefinitionChange,
  readOnly = false,
  serviceEndpoint = "",
  workflowId,
  onExecute,
  className,
}: WorkflowEditorProps) {
  const definition = useMemo(() => parseDef(definitionJson), [definitionJson]);

  const sync = useCallback(
    (next: WorkflowDefinition) => {
      onDefinitionChange?.(JSON.stringify(next));
    },
    [onDefinitionChange],
  );

  return (
    <WorkflowCanvas
      className={className}
      initial={definition}
      definitionSyncKey={definitionSyncKey}
      onChange={readOnly ? undefined : sync}
      readOnly={readOnly}
      serviceEndpoint={serviceEndpoint}
      workflowId={workflowId}
      onExecute={onExecute}
    />
  );
}
