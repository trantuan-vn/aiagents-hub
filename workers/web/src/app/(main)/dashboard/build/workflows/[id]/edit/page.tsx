"use client";

import { useCallback, useEffect, useState } from "react";

import { useParams } from "next/navigation";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { addNodeToDefinition, addStickyNoteToDefinition, type WorkflowDefinition } from "../../_components/workflow-canvas";
import { normalizeWorkflowEdge } from "../../_components/workflow-edge-utils";
import { WorkflowEditor } from "../../_components/workflow-editor";
import { WorkflowEditorShell } from "../../_components/workflow-editor-shell";
import { WorkflowExecuteDialog } from "../../_components/workflow-execute-dialog";
import { getWorkflow, updateWorkflow } from "../../_lib/api";
import { mergeAgentServiceEndpoint, readServiceEndpointFromDefinition } from "../../_lib/definition-utils";

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

export default function EditWorkflowPage() {
  const params = useParams();
  const id = Number(params.id);
  const t = useTranslations("WorkflowsPage");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [definition, setDefinition] = useState('{"nodes":[],"edges":[]}');
  const [isShared, setIsShared] = useState(false);
  const [starCount, setStarCount] = useState(0);
  const [starLabel, setStarLabel] = useState("");
  const [serviceEndpoint, setServiceEndpoint] = useState("");
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [executeOpen, setExecuteOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id || isNaN(id)) return;
    setLoading(true);
    try {
      const { workflow } = await getWorkflow(id);
      setName(workflow.name);
      setDescription(workflow.description ?? "");
      const def = workflow.definition || '{"nodes":[],"edges":[]}';
      setDefinition(def);
      setServiceEndpoint(readServiceEndpointFromDefinition(def));
      setIsShared(!!workflow.isShared);
      setStarCount(workflow.starCount ?? 0);
      setStarLabel(workflow.starLabel ?? "");
      setStatus(workflow.status === "published" ? "published" : "draft");
    } catch {
      toast.error(t("load_error"));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAddNode = useCallback(
    (type: string, label: string) => {
      const def = parseDef(definition);
      const extra =
        type === "agent" && serviceEndpoint
          ? { serviceEndpoint, memoryCollection: "vectorize-default", tools: [] }
          : type === "service_node" && serviceEndpoint
            ? { serviceEndpoint, catalogId: serviceEndpoint }
            : undefined;
      setDefinition(JSON.stringify(addNodeToDefinition(def, type, label, extra)));
    },
    [definition, serviceEndpoint],
  );

  const handleAddStickyNote = useCallback(() => {
    setDefinition(JSON.stringify(addStickyNoteToDefinition(parseDef(definition))));
  }, [definition]);

  const onSave = async () => {
    setSaving(true);
    try {
      await updateWorkflow(id, {
        name,
        description,
        definition: mergeAgentServiceEndpoint(definition, serviceEndpoint),
        isShared,
        starCount,
        starLabel,
        status: isShared ? "published" : status,
      });
      toast.success(t("saved"));
    } catch {
      toast.error(t("save_error"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-muted-foreground p-6 text-sm">...</p>;
  }

  return (
    <>
      <WorkflowExecuteDialog workflowId={id} open={executeOpen} onOpenChange={setExecuteOpen} />
      <WorkflowEditorShell
        workflowId={id}
        workflowName={name}
        serviceEndpoint={serviceEndpoint}
        saving={saving}
        onSave={() => void onSave()}
        onExecute={() => setExecuteOpen(true)}
        onAddNode={handleAddNode}
        onAddStickyNote={handleAddStickyNote}
        settings={{
          name,
          onNameChange: setName,
          description,
          onDescriptionChange: setDescription,
          status,
          onStatusChange: setStatus,
          isShared,
          onSharedChange: (v) => {
            setIsShared(v);
            if (v) setStatus("published");
          },
          starCount,
          onStarCountChange: setStarCount,
          starLabel,
          onStarLabelChange: setStarLabel,
          serviceEndpoint,
          onServiceEndpointChange: setServiceEndpoint,
        }}
      >
        <WorkflowEditor
          definitionJson={definition}
          onDefinitionChange={setDefinition}
          serviceEndpoint={serviceEndpoint}
          onExecute={() => setExecuteOpen(true)}
        />
      </WorkflowEditorShell>
    </>
  );
}
