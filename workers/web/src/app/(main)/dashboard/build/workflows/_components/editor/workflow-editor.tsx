"use client";

import { useCallback, useMemo } from "react";

import type { PublicTriggerKind } from "../../_lib/public-trigger-kinds";
import { WorkflowCanvas } from "../canvas/workflow-canvas";
import { normalizeWorkflowEdge } from "../edges/workflow-edge-utils";
import { normalizeWorkflowNodes, type WorkflowDefinition } from "../layout/workflow-definition";

interface WorkflowEditorProps {
  definitionJson: string;
  definitionSyncKey?: number;
  onDefinitionChange?: (json: string) => void;
  readOnly?: boolean;
  serviceEndpoint?: string;
  workflowId?: number;
  ownerId?: string;
  /** Community view: entry points the owner opened to other users. Null shows all. */
  publicTriggerKinds?: PublicTriggerKind[] | null;
  className?: string;
}

function parseDef(json: string): WorkflowDefinition {
  try {
    const p = JSON.parse(json) as Partial<WorkflowDefinition> & { nodes?: unknown; edges?: unknown };
    const nodes = normalizeWorkflowNodes(Array.isArray(p.nodes) ? (p.nodes as WorkflowDefinition["nodes"]) : []);
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
  ownerId,
  publicTriggerKinds,
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
      ownerId={ownerId}
      publicTriggerKinds={publicTriggerKinds}
    />
  );
}
