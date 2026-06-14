"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useParams, useRouter } from "next/navigation";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { addNodeToDefinition, addStickyNoteToDefinition, type WorkflowDefinition } from "../../_components/canvas/workflow-canvas";
import { normalizeWorkflowEdge } from "../../_components/edges/workflow-edge-utils";
import { WorkflowEditor } from "../../_components/editor/workflow-editor";
import { WorkflowEditorShell } from "../../_components/editor/workflow-editor-shell";
import { WorkflowExecuteDialog } from "../../_components/panels/workflow-panels/workflow-execute-dialog";
import { useWorkflowCollab } from "../../_components/hooks/use-workflow-collab";
import { useWorkflowUndo, useWorkflowUndoKeyboard } from "../../_components/hooks/use-workflow-undo";
import { createWorkflow, deleteWorkflow, getWorkflow, updateWorkflow } from "../../_lib/api";
import { parseWorkflowTags, serializeWorkflowTags } from "../../_lib/workflow-tags";

type WorkflowSnapshot = {
  name: string;
  description: string;
  tags: string[];
  definition: string;
  isShared: boolean;
  starCount: number;
  starLabel: string;
  status: "draft" | "published";
};

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

function snapshotFromState(state: {
  name: string;
  description: string;
  tags: string[];
  definition: string;
  isShared: boolean;
  starCount: number;
  starLabel: string;
  status: "draft" | "published";
}): WorkflowSnapshot {
  return { ...state };
}

export default function EditWorkflowPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const t = useTranslations("WorkflowsPage");
  const te = useTranslations("WorkflowEditorPage");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [definition, setDefinition] = useState('{"nodes":[],"edges":[]}');
  const [isShared, setIsShared] = useState(false);
  const [starCount, setStarCount] = useState(0);
  const [starLabel, setStarLabel] = useState("");
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [executeOpen, setExecuteOpen] = useState(false);
  const [definitionSyncKey, setDefinitionSyncKey] = useState(0);

  const hydratedRef = useRef(false);
  const saveGenRef = useRef(0);
  const { record, undo, redo, clear } = useWorkflowUndo<WorkflowSnapshot>();

  const currentSnapshot = useMemo(
    () =>
      snapshotFromState({
        name,
        description,
        tags,
        definition,
        isShared,
        starCount,
        starLabel,
        status,
      }),
    [name, description, tags, definition, isShared, starCount, starLabel, status],
  );
  const currentSnapshotRef = useRef(currentSnapshot);
  currentSnapshotRef.current = currentSnapshot;

  const bumpDefinitionSync = useCallback(() => {
    setDefinitionSyncKey((k) => k + 1);
  }, []);

  const applySnapshot = useCallback(
    (snap: WorkflowSnapshot) => {
      setName(snap.name);
      setDescription(snap.description);
      setTags(snap.tags);
      setDefinition(snap.definition);
      setIsShared(snap.isShared);
      setStarCount(snap.starCount);
      setStarLabel(snap.starLabel);
      setStatus(snap.status);
      bumpDefinitionSync();
    },
    [bumpDefinitionSync],
  );

  const load = useCallback(async () => {
    if (!id || isNaN(id)) return;
    setLoading(true);
    try {
      const { workflow } = await getWorkflow(id);
      const snap: WorkflowSnapshot = {
        name: workflow.name,
        description: workflow.description ?? "",
        tags: parseWorkflowTags(workflow.tags),
        definition: workflow.definition || '{"nodes":[],"edges":[]}',
        isShared: !!workflow.isShared,
        starCount: workflow.starCount ?? 0,
        starLabel: workflow.starLabel ?? "",
        status: workflow.status === "published" ? "published" : "draft",
      };
      applySnapshot(snap);
      clear();
      hydratedRef.current = true;
    } catch {
      toast.error(t("load_error"));
    } finally {
      setLoading(false);
    }
  }, [id, t, applySnapshot, clear]);

  useEffect(() => {
    void load();
  }, [load]);

  const persist = useCallback(
    async (payload: WorkflowSnapshot) => {
      await updateWorkflow(id, {
        name: payload.name.trim() || te("untitled"),
        description: payload.description,
        tags: serializeWorkflowTags(payload.tags),
        definition: payload.definition,
        isShared: payload.isShared,
        starCount: payload.starCount,
        starLabel: payload.starLabel,
        status: payload.isShared ? "published" : payload.status,
      });
    },
    [id, te],
  );

  useEffect(() => {
    if (!hydratedRef.current || loading) return;
    const gen = ++saveGenRef.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        setSaving(true);
        try {
          await persist(currentSnapshot);
          if (saveGenRef.current === gen) {
            /* saved */
          }
        } catch {
          if (saveGenRef.current === gen) toast.error(t("save_error"));
        } finally {
          if (saveGenRef.current === gen) setSaving(false);
        }
      })();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [currentSnapshot, loading, persist, t]);

  const recordAndSet = useCallback(
    <K extends keyof WorkflowSnapshot>(key: K, value: WorkflowSnapshot[K]) => {
      record(currentSnapshotRef.current);
      if (key === "name") setName(value as string);
      else if (key === "description") setDescription(value as string);
      else if (key === "tags") setTags(value as string[]);
      else if (key === "definition") setDefinition(value as string);
      else if (key === "isShared") setIsShared(value as boolean);
      else if (key === "starCount") setStarCount(value as number);
      else if (key === "starLabel") setStarLabel(value as string);
      else if (key === "status") setStatus(value as "draft" | "published");
    },
    [record],
  );

  useWorkflowUndoKeyboard(!loading, () => {
    undo(currentSnapshot, applySnapshot);
  }, () => {
    redo(currentSnapshot, applySnapshot);
  });

  const handleAddNode = useCallback(
    (type: string, label: string, pickExtra?: Record<string, unknown>) => {
      record(currentSnapshotRef.current);
      const def = parseDef(definition);
      const extra =
        pickExtra ??
        (type === "agent"
          ? { memoryCollection: "vectorize-default", tools: [] }
          : undefined);
      setDefinition(JSON.stringify(addNodeToDefinition(def, type, label, extra)));
    },
    [definition, record],
  );

  const handleAddStickyNote = useCallback(() => {
    record(currentSnapshotRef.current);
    setDefinition(JSON.stringify(addStickyNoteToDefinition(parseDef(definition))));
  }, [definition, record]);

  useWorkflowCollab({
    workflowId: id,
    definition,
    enabled: !loading && !!id,
    onRemoteDefinition: (json) => {
      record(currentSnapshotRef.current);
      setDefinition(json);
      bumpDefinitionSync();
    },
  });

  const onPublish = async () => {
    if (status === "published") return;
    setPublishing(true);
    record(currentSnapshotRef.current);
    const next = { ...currentSnapshotRef.current, status: "published" as const };
    applySnapshot(next);
    try {
      await persist(next);
      toast.success(te("published_toast"));
    } catch {
      toast.error(t("save_error"));
    } finally {
      setPublishing(false);
    }
  };

  const onDuplicate = async () => {
    try {
      const { workflow } = await createWorkflow({
        name: `${name.trim() || te("untitled")} (copy)`,
        description,
        tags: serializeWorkflowTags(tags),
        definition,
        status: "draft",
        isShared: false,
      });
      if (workflow.id) {
        toast.success(te("duplicated_toast"));
        router.push(`/dashboard/build/workflows/${workflow.id}/edit`);
      }
    } catch {
      toast.error(t("save_error"));
    }
  };

  const onDownload = () => {
    const blob = new Blob([definition], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(name.trim() || "workflow").replace(/\s+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onShare = () => {
    record(currentSnapshotRef.current);
    setIsShared((v) => !v);
    toast.success(isShared ? te("unshared_toast") : te("shared_toast"));
  };

  const onFavorite = () => {
    toast.message(te("favorite_toast"));
  };

  const onDelete = async () => {
    if (!confirm(t("delete_confirm"))) return;
    try {
      await deleteWorkflow(id);
      toast.success(t("deleted"));
      router.push("/dashboard/build/workflows");
    } catch {
      toast.error(t("load_error"));
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
        onWorkflowNameChange={(v) => recordAndSet("name", v)}
        workflowTags={tags}
        onWorkflowTagsChange={(v) => recordAndSet("tags", v)}
        status={status}
        saving={saving}
        publishing={publishing}
        onPublish={() => void onPublish()}
        onDuplicate={() => void onDuplicate()}
        onDownload={onDownload}
        onShare={onShare}
        onFavorite={onFavorite}
        onDelete={() => void onDelete()}
        onImportDefinition={(json) => {
          record(currentSnapshotRef.current);
          setDefinition(json);
          bumpDefinitionSync();
          toast.success(te("import_done"));
        }}
        onExecute={() => setExecuteOpen(true)}
        onAddNode={handleAddNode}
        onAddStickyNote={handleAddStickyNote}
        onApplyDefinition={(json) => {
          record(currentSnapshotRef.current);
          setDefinition(json);
          bumpDefinitionSync();
        }}
        settings={{
          name,
          onNameChange: (v) => recordAndSet("name", v),
          description,
          onDescriptionChange: (v) => recordAndSet("description", v),
          isShared,
          onSharedChange: (v) => {
            recordAndSet("isShared", v);
            if (v) recordAndSet("status", "published");
          },
          starCount,
          onStarCountChange: (n) => recordAndSet("starCount", n),
          starLabel,
          onStarLabelChange: (s) => recordAndSet("starLabel", s),
        }}
      >
        <WorkflowEditor
          workflowId={id}
          definitionJson={definition}
          definitionSyncKey={definitionSyncKey}
          onDefinitionChange={(json) => recordAndSet("definition", json)}
          onExecute={() => setExecuteOpen(true)}
        />
      </WorkflowEditorShell>
    </>
  );
}
