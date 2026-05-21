"use client";

import { useCallback, useMemo } from "react";

import { WorkflowCanvas, addNodeToDefinition, type WorkflowDefinition } from "./workflow-canvas";
import { normalizeWorkflowEdge } from "./workflow-edge-utils";
import { WorkflowEditorSidebar } from "./workflow-editor-sidebar";

interface WorkflowEditorProps {
  definitionJson: string;
  onDefinitionChange?: (json: string) => void;
  readOnly?: boolean;
  isShared?: boolean;
  onSharedChange?: (v: boolean) => void;
  starCount?: number;
  onStarCountChange?: (n: number) => void;
  starLabel?: string;
  onStarLabelChange?: (s: string) => void;
  serviceEndpoint?: string;
  onServiceEndpointChange?: (s: string) => void;
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
  onDefinitionChange,
  readOnly = false,
  isShared,
  onSharedChange,
  starCount = 0,
  onStarCountChange,
  starLabel = "",
  onStarLabelChange,
  serviceEndpoint = "",
  onServiceEndpointChange,
}: WorkflowEditorProps) {
  const definition = useMemo(() => parseDef(definitionJson), [definitionJson]);

  const sync = useCallback(
    (next: WorkflowDefinition) => {
      onDefinitionChange?.(JSON.stringify(next));
    },
    [onDefinitionChange],
  );

  const onAddNode = useCallback(
    (type: string, label: string) => {
      if (readOnly) return;
      const extra =
        type === "agent" && serviceEndpoint
          ? { serviceEndpoint, memoryCollection: "vectorize-default", tools: [] }
          : undefined;
      sync(addNodeToDefinition(definition, type, label, extra));
    },
    [readOnly, serviceEndpoint, definition, sync],
  );

  const showSidebar = !readOnly;

  return (
    <div className={`grid gap-4 ${showSidebar ? "lg:grid-cols-[200px_1fr]" : ""}`}>
      {showSidebar ? (
        <WorkflowEditorSidebar
          isShared={isShared}
          onSharedChange={onSharedChange}
          starCount={starCount}
          onStarCountChange={onStarCountChange}
          starLabel={starLabel}
          onStarLabelChange={onStarLabelChange}
          serviceEndpoint={serviceEndpoint}
          onServiceEndpointChange={onServiceEndpointChange}
          onAddNode={onAddNode}
        />
      ) : null}
      <WorkflowCanvas
        initial={definition}
        onChange={readOnly ? undefined : sync}
        readOnly={readOnly}
        serviceEndpoint={serviceEndpoint}
      />
    </div>
  );
}
