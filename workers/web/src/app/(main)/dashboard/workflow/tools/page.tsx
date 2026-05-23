"use client";

import { useState } from "react";

import { Globe, Plug, Search, Wrench } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useRequireAdmin } from "../../_hooks/use-require-admin";

const INTERNAL_TOOLS = [
  { id: "http-request", nameKey: "tool_http", descKey: "tool_http_desc" },
  { id: "code", nameKey: "tool_code", descKey: "tool_code_desc" },
  { id: "set", nameKey: "tool_set", descKey: "tool_set_desc" },
  { id: "merge", nameKey: "tool_merge", descKey: "tool_merge_desc" },
] as const;

const EXTERNAL_TOOLS = [
  { id: "slack", nameKey: "tool_slack", descKey: "tool_slack_desc" },
  { id: "google-sheets", nameKey: "tool_sheets", descKey: "tool_sheets_desc" },
  { id: "github", nameKey: "tool_github", descKey: "tool_github_desc" },
  { id: "openai-functions", nameKey: "tool_openai_fn", descKey: "tool_openai_fn_desc" },
] as const;

export default function WorkflowToolsAdminPage() {
  const t = useTranslations("WorkflowAdminPage");
  const isAdmin = useRequireAdmin();
  const [query, setQuery] = useState("");

  if (!isAdmin) return null;

  const q = query.trim().toLowerCase();
  const filterTools = (tools: readonly { id: string; nameKey: string; descKey: string }[]) =>
    tools.filter((tool) => !q || t(tool.nameKey).toLowerCase().includes(q) || t(tool.descKey).toLowerCase().includes(q));

  const internal = filterTools(INTERNAL_TOOLS);
  const external = filterTools(EXTERNAL_TOOLS);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("tools_title")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("tools_description")}</p>
      </div>

      <div className="relative max-w-md">
        <Search className="text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4" />
        <Input
          className="pl-9"
          placeholder={t("search_tools")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <Tabs defaultValue="internal">
        <TabsList>
          <TabsTrigger value="internal">
            <Wrench className="mr-1.5 h-4 w-4" />
            {t("tools_internal")}
          </TabsTrigger>
          <TabsTrigger value="external">
            <Globe className="mr-1.5 h-4 w-4" />
            {t("tools_external")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="internal" className="mt-4">
          <ToolGrid tools={internal} badge={t("badge_internal")} t={t} icon={Plug} />
        </TabsContent>
        <TabsContent value="external" className="mt-4">
          <ToolGrid tools={external} badge={t("badge_external")} t={t} icon={Globe} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ToolGrid({
  tools,
  badge,
  t,
  icon: Icon,
}: {
  tools: readonly { id: string; nameKey: string; descKey: string }[];
  badge: string;
  t: ReturnType<typeof useTranslations<"WorkflowAdminPage">>;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4" />
          {badge}
        </CardTitle>
        <CardDescription>{t("tools_catalog_hint")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((tool) => (
          <div key={tool.id} className="hover:bg-muted/50 rounded-lg border p-3 transition-colors">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{t(tool.nameKey)}</p>
                <p className="text-muted-foreground mt-1 text-xs">{t(tool.descKey)}</p>
              </div>
              <Badge variant="outline" className="shrink-0 text-[10px]">
                {badge}
              </Badge>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
