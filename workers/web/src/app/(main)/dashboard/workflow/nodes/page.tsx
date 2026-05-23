"use client";

import { useMemo, useState } from "react";

import { Bot, Layers, Play, Search, UserCheck, Zap } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useRequireAdmin } from "../../_hooks/use-require-admin";

const NODE_CATEGORIES = [
  {
    id: "trigger",
    icon: Play,
    nodes: [{ type: "trigger", nameKey: "cat_trigger_manual", descKey: "cat_trigger_manual_desc" }],
  },
  {
    id: "core",
    icon: Layers,
    nodes: [
      { type: "core", nameKey: "cat_core", descKey: "cat_core_desc" },
      { type: "flow", nameKey: "cat_flow", descKey: "cat_flow_desc" },
    ],
  },
  {
    id: "ai",
    icon: Bot,
    nodes: [{ type: "agent", nameKey: "cat_agent", descKey: "cat_agent_desc" }],
  },
  {
    id: "action",
    icon: Zap,
    nodes: [
      { type: "action_in_app", nameKey: "cat_action", descKey: "cat_action_desc" },
      { type: "data_transformation", nameKey: "cat_transform", descKey: "cat_transform_desc" },
    ],
  },
  {
    id: "human",
    icon: UserCheck,
    nodes: [{ type: "human_review", nameKey: "cat_human", descKey: "cat_human_desc" }],
  },
] as const;

type Category = (typeof NODE_CATEGORIES)[number];
type NodeItem = Category["nodes"][number];
type DisplayCategory = Omit<Category, "nodes"> & { nodes: readonly NodeItem[] };

export default function WorkflowNodesAdminPage() {
  const t = useTranslations("WorkflowAdminPage");
  const isAdmin = useRequireAdmin();
  const [query, setQuery] = useState("");

  const filtered = useMemo((): readonly DisplayCategory[] => {
    const q = query.trim().toLowerCase();
    if (!q) return NODE_CATEGORIES;
    return NODE_CATEGORIES.map((cat) => ({
      ...cat,
      nodes: cat.nodes.filter(
        (n) => t(n.nameKey).toLowerCase().includes(q) || t(n.descKey).toLowerCase().includes(q),
      ),
    })).filter((cat) => cat.nodes.length > 0);
  }, [query, t]);

  if (!isAdmin) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("nodes_title")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("nodes_description")}</p>
      </div>

      <div className="relative max-w-md">
        <Search className="text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4" />
        <Input
          className="pl-9"
          placeholder={t("search_nodes")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <Tabs defaultValue="all">
        <TabsList className="flex-wrap">
          <TabsTrigger value="all">{t("tab_all")}</TabsTrigger>
          {NODE_CATEGORIES.map((cat) => (
            <TabsTrigger key={cat.id} value={cat.id}>
              {t(`category_${cat.id}`)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="all" className="mt-4 space-y-6">
          {filtered.map((cat) => (
            <CategorySection key={cat.id} category={cat} t={t} />
          ))}
        </TabsContent>

        {NODE_CATEGORIES.map((cat) => (
          <TabsContent key={cat.id} value={cat.id} className="mt-4">
            <CategorySection category={filtered.find((c) => c.id === cat.id) ?? cat} t={t} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function CategorySection({
  category,
  t,
}: {
  category: DisplayCategory;
  t: ReturnType<typeof useTranslations<"WorkflowAdminPage">>;
}) {
  const Icon = category.icon;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4" />
          {t(`category_${category.id}`)}
        </CardTitle>
        <CardDescription>{t(`category_${category.id}_desc`)}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {category.nodes.map((node) => (
          <div key={node.type} className="hover:bg-muted/50 rounded-lg border p-3 transition-colors">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{t(node.nameKey)}</p>
                <p className="text-muted-foreground mt-1 text-xs">{t(node.descKey)}</p>
              </div>
              <Badge variant="secondary" className="shrink-0 font-mono text-[10px]">
                {node.type}
              </Badge>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
