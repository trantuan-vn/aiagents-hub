"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Bot, Layers, Pencil, Play, Plus, Search, Trash2, UserCheck, Zap } from "lucide-react";
import { useTranslations } from "next-intl";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  createWorkflowNode,
  deleteWorkflowNode,
  fetchWorkflowNodeRegistry,
  updateWorkflowNode,
  type WorkflowNodeCategory,
  type WorkflowNodeDefinition,
} from "@/lib/workflow-node-registry";

import { useRequireAdmin } from "../../_hooks/use-require-admin";
import { NodeFormDialog } from "./node-form-dialog";

const CATEGORY_ICONS: Record<WorkflowNodeCategory, React.ComponentType<{ className?: string }>> = {
  trigger: Play,
  core: Layers,
  ai: Bot,
  action: Zap,
  human: UserCheck,
  resource: Layers,
  utility: Layers,
};

const CATEGORY_ORDER: WorkflowNodeCategory[] = ["trigger", "core", "ai", "action", "human", "resource", "utility"];

export function NodeManagementPage() {
  const t = useTranslations("WorkflowNodeRegistry");
  const tEditor = useTranslations("WorkflowEditorPage");
  const tAdmin = useTranslations("WorkflowAdminPage");
  const { toast } = useToast();
  const isAdmin = useRequireAdmin();

  const [nodes, setNodes] = useState<WorkflowNodeDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<WorkflowNodeDefinition | null>(null);

  const loadNodes = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const registry = await fetchWorkflowNodeRegistry(signal);
      setNodes(registry.nodes);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : t("fetch_error"));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!isAdmin) return;
    const controller = new AbortController();
    void loadNodes(controller.signal);
    return () => controller.abort();
  }, [isAdmin, loadNodes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return nodes;
    return nodes.filter(
      (n) =>
        n.id.toLowerCase().includes(q) ||
        n.runtimeType.toLowerCase().includes(q) ||
        tEditor(n.nameKey).toLowerCase().includes(q) ||
        tEditor(n.descriptionKey).toLowerCase().includes(q),
    );
  }, [nodes, query, tEditor]);

  const byCategory = useMemo(() => {
    const map = new Map<WorkflowNodeCategory, WorkflowNodeDefinition[]>();
    for (const cat of CATEGORY_ORDER) map.set(cat, []);
    for (const node of filtered) {
      const list = map.get(node.category) ?? [];
      list.push(node);
      map.set(node.category, list);
    }
    return map;
  }, [filtered]);

  const openCreate = () => {
    setEditingNode(null);
    setDialogOpen(true);
  };

  const openEdit = (node: WorkflowNodeDefinition) => {
    setEditingNode(node);
    setDialogOpen(true);
  };

  const handleSubmit = async (data: WorkflowNodeDefinition | Partial<WorkflowNodeDefinition>) => {
    try {
      if (editingNode) {
        await updateWorkflowNode(editingNode.id, data);
        toast({ title: t("update_success") });
      } else {
        await createWorkflowNode(data as WorkflowNodeDefinition);
        toast({ title: t("create_success") });
      }
      await loadNodes();
    } catch (err) {
      toast({
        title: t("error"),
        description: err instanceof Error ? err.message : t("save_error"),
        variant: "destructive",
      });
      throw err;
    }
  };

  const handleDelete = async (node: WorkflowNodeDefinition) => {
    if (node.isBuiltin) {
      toast({ title: t("cannot_delete_builtin"), variant: "destructive" });
      return;
    }
    if (!window.confirm(t("delete_confirm", { id: node.id }))) return;
    try {
      await deleteWorkflowNode(node.id);
      toast({ title: t("delete_success") });
      await loadNodes();
    } catch (err) {
      toast({
        title: t("error"),
        description: err instanceof Error ? err.message : t("delete_error"),
        variant: "destructive",
      });
    }
  };

  if (!isAdmin) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{tAdmin("nodes_title")}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t("page_description")}</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          {t("create_node")}
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="relative max-w-md">
        <Search className="text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4" />
        <Input
          className="pl-9"
          placeholder={tAdmin("search_nodes")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <Tabs defaultValue="all">
        <TabsList className="flex-wrap">
          <TabsTrigger value="all">{tAdmin("tab_all")}</TabsTrigger>
          {CATEGORY_ORDER.map((cat) => (
            <TabsTrigger key={cat} value={cat}>
              {t(`category_${cat}`)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="all" className="mt-4 space-y-6">
          {loading ? (
            <p className="text-muted-foreground text-sm">{t("loading")}</p>
          ) : (
            CATEGORY_ORDER.map((cat) => {
              const list = byCategory.get(cat) ?? [];
              if (list.length === 0) return null;
              return <CategorySection key={cat} category={cat} nodes={list} t={t} tEditor={tEditor} onEdit={openEdit} onDelete={handleDelete} />;
            })
          )}
        </TabsContent>

        {CATEGORY_ORDER.map((cat) => (
          <TabsContent key={cat} value={cat} className="mt-4">
            <CategorySection
              category={cat}
              nodes={byCategory.get(cat) ?? []}
              t={t}
              tEditor={tEditor}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          </TabsContent>
        ))}
      </Tabs>

      <NodeFormDialog open={dialogOpen} onOpenChange={setDialogOpen} node={editingNode} onSubmit={handleSubmit} />
    </div>
  );
}

function CategorySection({
  category,
  nodes,
  t,
  tEditor,
  onEdit,
  onDelete,
}: {
  category: WorkflowNodeCategory;
  nodes: WorkflowNodeDefinition[];
  t: ReturnType<typeof useTranslations<"WorkflowNodeRegistry">>;
  tEditor: ReturnType<typeof useTranslations<"WorkflowEditorPage">>;
  onEdit: (node: WorkflowNodeDefinition) => void;
  onDelete: (node: WorkflowNodeDefinition) => void;
}) {
  const Icon = CATEGORY_ICONS[category];
  if (nodes.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("no_nodes_in_category")}</p>;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4" />
          {t(`category_${category}`)}
        </CardTitle>
        <CardDescription>{t(`category_${category}_desc`)}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {nodes.map((node) => (
          <div key={node.id} className="hover:bg-muted/50 rounded-lg border p-3 transition-colors">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{tEditor(node.nameKey)}</p>
                <p className="text-muted-foreground mt-1 text-xs">{tEditor(node.descriptionKey)}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    {node.runtimeType}
                  </Badge>
                  {node.isBuiltin ? (
                    <Badge variant="outline" className="text-[10px]">
                      {t("badge_builtin")}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">
                      {t("badge_custom")}
                    </Badge>
                  )}
                  {!node.isActive ? (
                    <Badge variant="destructive" className="text-[10px]">
                      {t("badge_inactive")}
                    </Badge>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 gap-0.5">
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(node)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                {!node.isBuiltin ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive h-7 w-7"
                    onClick={() => onDelete(node)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
